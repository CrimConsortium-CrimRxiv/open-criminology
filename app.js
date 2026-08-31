/* =============================================================
   Is Your Criminology Open? — A Utilitarian Assessment
   A CrimConsortium tool. Fully client-side. No storage, no network.

   Design / behavior notes:
   - Inherits the Faculty Explorer / Mentor Match design system.
   - Theme toggle mirrors the family (no localStorage; resets on load).
   - Assessment flow: Mode → Status → Item type → Item name → Questions
     adapted by mode/status/type → Results page with suggestions, scoring
     drawer, downloadable summary, and conditional certificate.
   - All copy: clinical-but-encouraging, plain, concrete, not preachy.
   ============================================================= */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Theme (same toggle behavior as the rest of the family).
  // No persistence — per requirements (no cookies, no storage).
  // ----------------------------------------------------------------
  function preferredTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    renderThemeIcon();
  }
  function renderThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    btn.innerHTML = isDark
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
  applyTheme(preferredTheme());

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }
  function fmtDate(d) {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ----------------------------------------------------------------
  // Data model
  // ----------------------------------------------------------------
  const MODES = [
    { id: 'research', label: 'Research', help: 'A study, paper, dataset, code, or other research output.' },
    { id: 'teaching', label: 'Teaching', help: 'A course, syllabus, assignment, reading list, textbook, or other teaching output.' },
  ];

  const STATUSES = [
    { id: 'finished', label: 'Finished', help: 'Done and out in the world. We will assess what actually happened.' },
    { id: 'current',  label: 'Current',  help: 'In progress right now. We will assess what is in place so far.' },
    { id: 'planned',  label: 'Planned',  help: 'Not started yet. We will assess what you intend to do.' },
  ];

  // Per-mode item types
  const ITEM_TYPES = {
    research: [
      { id: 'paper',         label: 'Paper',                 help: 'Journal article, book chapter, working paper, or report.' },
      { id: 'project',       label: 'Research project',      help: 'A whole study or research program with multiple outputs.' },
      { id: 'data',          label: 'Data',                  help: 'A dataset you collected, cleaned, or assembled.' },
      { id: 'code',          label: 'Code',                  help: 'Analysis scripts, software, models, or computational tools.' },
      { id: 'preregistration', label: 'Preregistration',     help: 'A registered design, analysis plan, or protocol.' },
      { id: 'other_research', label: 'Other research output', help: 'Slides, posters, talks, briefs, blogs, or other research products.' },
    ],
    teaching: [
      { id: 'course',        label: 'Course',                help: 'An entire course, taught or in design.' },
      { id: 'syllabus',      label: 'Syllabus',              help: 'A course syllabus or schedule document.' },
      { id: 'assignment',    label: 'Assignment',            help: 'A problem set, paper prompt, lab, project, or exercise.' },
      { id: 'lecture',       label: 'Lecture',               help: 'A single lecture, talk, or class session.' },
      { id: 'module',        label: 'Module / unit',         help: 'A multi-session unit within a course.' },
      { id: 'textbook',      label: 'Textbook',              help: 'A textbook, monograph, or long-form teaching text.' },
      { id: 'reading_list',  label: 'Reading list',          help: 'A curated set of readings for a course or topic.' },
      { id: 'course_shell',  label: 'Course shell',          help: 'A reusable LMS course shell, packaged for sharing.' },
      { id: 'evaluation',    label: 'Student evaluation instrument', help: 'A test, quiz, rubric, or other instrument to evaluate students.' },
      { id: 'other_teaching', label: 'Other teaching output', help: 'Slides, videos, study guides, OER, or other teaching materials.' },
    ],
  };

  // ----------------------------------------------------------------
  // Question bank
  //
  // Each question has:
  //   id           — stable identifier (used in scoring + summary)
  //   text         — the question
  //   help         — short clarifier (optional)
  //   choices      — [{ id, label, points, [veto] }] where points are
  //                  awarded if that choice is selected.
  //   maxPoints    — automatically computed from max(choices.points).
  //   appliesTo    — { modes?, types?, statuses? } filter.
  //   weight       — multiplier (we keep this at 1 for transparency).
  //   tags         — used by suggestion engine to phrase advice.
  //
  // Choice text is hard-edged on purpose: behavioral, multiple-choice,
  // and observable. We avoid fuzzy self-rating.
  //
  // Status handling: for "planned" or "current" items, we phrase
  // choices as commitments ("I plan to…") and slightly compress
  // the question set — see filterQuestions().
  // ----------------------------------------------------------------
  const QBANK = [
    // ===============================================================
    // RESEARCH — common to all research types
    // ===============================================================
    {
      id: 'r_access',
      appliesTo: { modes: ['research'] },
      text: (ctx) => statusVerb(ctx, 'How can a reader get the full output without paying?', 'How will a reader get the full output without paying?'),
      help: 'The single biggest openness signal: can anyone read or use it for free?',
      choices: [
        { id: 'cc_licensed', label: 'Free with a CC license (diamond, green, or gold).', points: 6 },
        { id: 'bronze',  label: 'Free without a license (bronze).', points: 4 },
        { id: 'paywall', label: 'Behind a paywall only. No free version exists.', points: 0 },
      ],
      tags: ['access'],
    },
    {
      id: 'r_license',
      appliesTo: { modes: ['research'] },
      text: (ctx) => statusVerb(ctx, 'What license is attached to the work?', 'What license will you attach to the work?'),
      help: 'A license tells others what they may legally do with it. No license usually means "all rights reserved" by default.',
      choices: [
        { id: 'cc-by',    label: 'CC BY (or CC0) — anyone can reuse with attribution.', points: 4 },
        { id: 'cc-nc-sa', label: 'CC with restrictions but allows derivatives (CC BY-NC, CC BY-SA, or CC BY-NC-SA).', points: 3 },
        { id: 'cc-nd',    label: 'CC BY-ND — no derivatives.', points: 2 },
        { id: 'publisher', label: 'Publisher’s default copyright terms (I did not retain rights).', points: 1 },
        { id: 'none',     label: 'No license at all.', points: 0 },
        { id: 'unknown',  label: 'I don’t know what the license is.', points: 0 },
      ],
      tags: ['license'],
    },
    {
      id: 'r_pid',
      appliesTo: { modes: ['research'] },
      statuses: ['finished', 'current'],
      text: 'Does the output have a persistent identifier (a DOI or other PID)?',
      help: 'Persistent identifiers make work findable and citable years later, even if a URL breaks.',
      choices: [
        { id: 'doi',    label: 'Yes — a DOI from a publisher or repository.', points: 2 },
        { id: 'pid',    label: 'Yes — another stable PID (handle, ARK, etc.).', points: 2 },
        { id: 'url',    label: 'Only a regular URL.', points: 1 },
        { id: 'none',   label: 'No stable identifier.', points: 0 },
      ],
      tags: ['findable'],
    },

    // -- Paper-specific
    {
      id: 'r_paper_preprint',
      appliesTo: { modes: ['research'], types: ['paper'] },
      multi: true,
      text: (ctx) => statusVerb(ctx, 'Did you post a preprint? (Select all that apply.)', 'Will you post a preprint? (Select all that apply.)'),
      help: 'A preprint gets the work to readers immediately and protects you against access losses later.',
      choices: [
        { id: 'crimrxiv', label: 'Yes — on CrimRxiv (or another disciplinary preprint server).', points: 3 },
        { id: 'general',  label: 'Yes — on Zenodo, OSF, or another general preprint server.', points: 3 },
        { id: 'institutional', label: 'Yes — on an institutional repository.', points: 2 },
        { id: 'social',   label: 'Yes — on a scholarly social network (ResearchGate, Academia.edu, etc.).', points: 2 },
        { id: 'personal', label: 'Yes — on my personal website.', points: 2 },
        { id: 'no',       label: 'No, and I do not plan to.', points: 0 },
      ],
      tags: ['preprint'],
    },
    {
      id: 'r_paper_rights',
      appliesTo: { modes: ['research'], types: ['paper'] },
      text: (ctx) => statusVerb(ctx, 'Did you have the right to immediately share an open version (postprint or AAM)?', 'Will you have the right to immediately share an open version (postprint or AAM)?'),
      help: 'Many funders and institutions now require rights retention. It costs nothing and unlocks Green OA.',
      choices: [
        { id: 'vor_oa', label: 'Not applicable — the version of record is open access.', points: 3 },
        { id: 'policy', label: 'Yes — an institutional or funder rights retention policy covers this output.', points: 3 },
        { id: 'rrs',    label: 'Yes — I attached a rights retention statement on submission.', points: 3 },
        { id: 'check',  label: 'Yes — I checked the journal has no embargo.', points: 2 },
        { id: 'no_dontknow', label: 'I did not check / I do not know.', points: 0 },
      ],
      tags: ['rights'],
    },
    {
      id: 'r_paper_data_link',
      appliesTo: { modes: ['research'], types: ['paper'] },
      text: (ctx) => statusVerb(ctx, 'In the paper, do you point readers to your data and code with a working link?', 'In the paper, will you point readers to your data and code with a working link?'),
      help: 'A Data Availability Statement should contain a link or DOI, not just "available on request."',
      choices: [
        { id: 'link_both', label: 'Yes — working links to both data and code.', points: 3 },
        { id: 'link_one',  label: 'Yes — working link to one of them.', points: 2 },
        { id: 'no_statement', label: 'No data/code statement at all.', points: 0 },
        { id: 'na',        label: 'Not applicable (no data or code).', points: 2 },
      ],
      tags: ['data', 'code', 'transparency'],
    },

    // -- Data-specific
    {
      id: 'r_data_share',
      appliesTo: { modes: ['research'], types: ['data', 'project'] },
      multi: true,
      text: (ctx) => statusVerb(ctx, 'Where does the data live and how can someone use it? (Select all that apply.)', 'Where will the data live and how will someone use it? (Select all that apply.)'),
      help: 'Sharing in a trusted, indexed repository is much more reusable than a personal website.',
      choices: [
        { id: 'repo_open', label: 'Trusted public repository (CrimRxiv, ICPSR, OSF, Zenodo, Dataverse, etc.) with open access.', points: 5 },
        { id: 'repo_restricted', label: 'Trusted repository, restricted/controlled access for sensitive data.', points: 4 },
        { id: 'personal_open', label: 'Personal/lab site, public download.', points: 2 },
        { id: 'not_shared', label: 'Not shared / kept private.', points: 0 },
        { id: 'cannot_share', label: 'Cannot be shared due to legal or ethical limits — and that is documented.', points: 3 },
      ],
      tags: ['data', 'reuse'],
    },
    {
      id: 'r_data_docs',
      appliesTo: { modes: ['research'], types: ['data', 'project'] },
      text: (ctx) => statusVerb(ctx, 'Does the data come with a codebook or README that a stranger could use?', 'Will the data come with a codebook or README that a stranger could use?'),
      help: 'A useful dataset includes variable definitions, units, codes for missingness, and a brief description of provenance.',
      choices: [
        { id: 'full',  label: 'Yes — variable-level codebook plus README and provenance notes.', points: 3 },
        { id: 'basic', label: 'A README or short codebook, but not both.', points: 2 },
        { id: 'minimal', label: 'Only variable names and basic metadata.', points: 1 },
        { id: 'none',  label: 'No documentation.', points: 0 },
      ],
      tags: ['data', 'documentation'],
    },

    // -- Code-specific
    {
      id: 'r_code_share',
      appliesTo: { modes: ['research'], types: ['code', 'project'] },
      multi: true,
      text: (ctx) => statusVerb(ctx, 'Where does the analysis code live? (Select all that apply.)', 'Where will the analysis code live? (Select all that apply.)'),
      help: 'Public, versioned code with a DOI or other persistent identifier is the gold standard for reproducible analysis.',
      choices: [
        { id: 'repo_doi', label: 'Public version-controlled repo (GitHub/GitLab) and archived with a persistent identifier — DOI, SWHID, or similar (Zenodo, Software Heritage, etc.).', points: 4 },
        { id: 'repo',    label: 'Public version-controlled repo, no persistent identifier.', points: 3 },
        { id: 'upload',  label: 'Posted as a static upload (OSF, supplementary materials, etc.).', points: 2 },
        { id: 'not_shared', label: 'Not shared.', points: 0 },
      ],
      tags: ['code', 'reuse'],
    },
    {
      id: 'r_code_runs',
      appliesTo: { modes: ['research'], types: ['code', 'project'] },
      statuses: ['finished', 'current'],
      text: 'Can someone else actually run the code on their own machine?',
      help: 'A runnable repo includes environment files, seeds, and a short README that names every dependency.',
      choices: [
        { id: 'one_command', label: 'Yes — README plus environment file; runs in one command.', points: 3 },
        { id: 'readme',  label: 'README with manual steps, no environment lock file.', points: 2 },
        { id: 'code_only', label: 'Code only — no README and no environment notes.', points: 1 },
        { id: 'no',      label: 'No / I do not know.', points: 0 },
      ],
      tags: ['code', 'reproducibility'],
    },

    // -- Preregistration-specific
    {
      id: 'r_prereg_where',
      appliesTo: { modes: ['research'], types: ['preregistration'] },
      text: (ctx) => statusVerb(ctx, 'Where is the preregistration registered?', 'Where will the preregistration be registered?'),
      help: 'Independent registries with date-stamps make a preregistration credible.',
      choices: [
        { id: 'rr',     label: 'Registered Report (peer-reviewed before data collection).', points: 5 },
        { id: 'public', label: 'Public preregistration on an independent registry (OSF, AsPredicted, ClinicalTrials.gov, etc.).', points: 4 },
        { id: 'private', label: 'Private/embargoed preregistration.', points: 2 },
        { id: 'none',   label: 'No formal preregistration.', points: 0 },
      ],
      tags: ['preregistration'],
    },
    {
      id: 'r_prereg_specifics',
      appliesTo: { modes: ['research'], types: ['preregistration', 'project'] },
      text: (ctx) => statusVerb(ctx, 'Did the preregistration specify hypotheses, design, and analysis plan?', 'Will the preregistration specify hypotheses, design, and analysis plan?'),
      choices: [
        { id: 'full',  label: 'Yes — all three, with operational decision rules.', points: 3 },
        { id: 'partial', label: 'Two of the three.', points: 2 },
        { id: 'minimal', label: 'Hypotheses only.', points: 1 },
        { id: 'none',  label: 'None of the above.', points: 0 },
      ],
      tags: ['preregistration', 'transparency'],
    },

    // -- Project-level extras (project covers many outputs)
    {
      id: 'r_project_dmp',
      appliesTo: { modes: ['research'], types: ['project'] },
      text: (ctx) => statusVerb(ctx, 'Does the project have a written data-management or open-science plan?', 'Will the project have a written data-management or open-science plan?'),
      choices: [
        { id: 'yes_public', label: 'Yes — and it is publicly posted.', points: 3 },
        { id: 'yes_internal', label: 'Yes — internal only.', points: 2 },
        { id: 'no',        label: 'No.', points: 0 },
      ],
      tags: ['planning'],
    },

    // ===============================================================
    // TEACHING — common to all teaching types
    // ===============================================================
    {
      id: 't_cost',
      appliesTo: { modes: ['teaching'] },
      text: (ctx) => statusVerb(ctx, 'What is the total cost to a student to access everything required?', 'What will the total cost to a student be to access everything required?'),
      help: 'Money students must spend out of pocket — textbooks, access codes, course packs, reprints.',
      choices: [
        { id: 'zero',   label: '$0 — fully no-cost (ZTC).', points: 6 },
        { id: 'low',    label: '$1–$40 (effectively low-cost, e.g., a single low-cost course pack).', points: 4 },
        { id: 'mid',    label: '$41–$100.', points: 2 },
        { id: 'high',   label: '$101–$200.', points: 1 },
        { id: 'very_high', label: 'More than $200.', points: 0 },
      ],
      tags: ['cost'],
    },
    {
      id: 't_license',
      appliesTo: { modes: ['teaching'] },
      text: (ctx) => statusVerb(ctx, 'What license is on the material you created?', 'What license will be on the material you created?'),
      help: 'OER are formally defined by an open license that lets others reuse, revise, remix, and redistribute.',
      choices: [
        { id: 'cc-by',    label: 'CC BY (or CC0) — anyone can reuse with attribution.', points: 4 },
        { id: 'cc-other', label: 'CC with restrictions but allows derivatives (CC BY-NC, CC BY-SA, or CC BY-NC-SA).', points: 3 },
        { id: 'cc-nd',    label: 'CC BY-ND — no derivatives.', points: 1 },
        { id: 'all_rights', label: 'All rights reserved (default copyright).', points: 0 },
        { id: 'none',     label: 'No license at all.', points: 0 },
        { id: 'unknown',  label: 'I don’t know what the license is.', points: 0 },
      ],
      tags: ['license'],
    },
    {
      id: 't_access',
      appliesTo: { modes: ['teaching'] },
      multi: true,
      text: (ctx) => statusVerb(ctx, 'Where does the material live? (Select all that apply.)', 'Where will the material live? (Select all that apply.)'),
      help: 'Open repositories make materials reachable by other instructors and durable beyond your course or institution.',
      choices: [
        { id: 'oer_repo', label: 'An open OER repository (CrimRxiv, OER Commons, MERLOT, Pressbooks, etc.).', points: 4 },
        { id: 'personal_open', label: 'A personal or institutional site, publicly downloadable (including a posted course-export file).', points: 3 },
        { id: 'lms_catalog', label: 'An LMS-to-LMS sharing catalog (Canvas Commons, D2L Sharing, etc.) — other instructors on that platform can import it automatically.', points: 2 },
        { id: 'lms_closed', label: 'Behind an LMS login, accessible only to enrolled students.', points: 1 },
        { id: 'not_shared', label: 'Not shared outside my classroom.', points: 0 },
      ],
      tags: ['access'],
    },

    // -- Course-specific
    {
      id: 't_course_oer',
      appliesTo: { modes: ['teaching'], types: ['course'] },
      text: (ctx) => statusVerb(ctx, 'What share of required readings/media in the course are free for students?', 'What share of required readings/media in the course will be free for students?'),
      choices: [
        { id: 'all',    label: '100% — every required item is free.', points: 5 },
        { id: 'most',   label: 'About 75–99%.', points: 4 },
        { id: 'mixed',  label: 'About 50–74%.', points: 3 },
        { id: 'few',    label: 'About 25–49%.', points: 2 },
        { id: 'almost_none', label: 'Less than 25%.', points: 1 },
        { id: 'none',   label: '0% — students must pay for everything.', points: 0 },
      ],
      tags: ['cost'],
    },
    {
      id: 't_course_shell',
      appliesTo: { modes: ['teaching'], types: ['course', 'course_shell'] },
      text: (ctx) => statusVerb(ctx, 'Can another instructor import or copy the course materials in one package?', 'Will another instructor be able to import or copy the course materials in one package?'),
      choices: [
        { id: 'shell_open', label: 'Yes — a Common Cartridge / Pressbook / similar package is publicly available.', points: 3 },
        { id: 'no',     label: 'No — materials are scattered and would need to be rebuilt.', points: 0 },
      ],
      tags: ['reuse'],
    },

    // -- Syllabus-specific
    {
      id: 't_syllabus_public',
      appliesTo: { modes: ['teaching'], types: ['syllabus'] },
      text: (ctx) => statusVerb(ctx, 'Is the syllabus posted publicly?', 'Will the syllabus be posted publicly?'),
      choices: [
        { id: 'public_open', label: 'Yes — public web page or repository, with an open license.', points: 4 },
        { id: 'public_no_license', label: 'Yes — public, no license stated.', points: 2 },
        { id: 'no',     label: 'No — not shared outside students.', points: 0 },
      ],
      tags: ['access', 'license'],
    },

    // -- Assignment / lecture / module / evaluation — reuse-focused
    {
      id: 't_unit_reusable',
      appliesTo: { modes: ['teaching'], types: ['assignment', 'lecture', 'module', 'evaluation', 'other_teaching'] },
      text: (ctx) => statusVerb(ctx, 'Could another instructor pick this up and use it in their class with little editing?', 'Will another instructor be able to pick this up and use it in their class with little editing?'),
      help: 'Reusability requires editable files, clear context, and no proprietary lock-in.',
      choices: [
        { id: 'turnkey', label: 'Yes — editable file, with instructor notes and learning objectives.', points: 4 },
        { id: 'editable', label: 'Editable file but no instructor notes.', points: 3 },
        { id: 'pdf',    label: 'PDF only — readable but hard to edit.', points: 1 },
        { id: 'locked', label: 'Locked in a closed LMS/tool.', points: 0 },
      ],
      tags: ['reuse'],
    },

    // -- Textbook-specific
    {
      id: 't_textbook_oer',
      appliesTo: { modes: ['teaching'], types: ['textbook'] },
      text: (ctx) => statusVerb(ctx, 'How is the textbook published?', 'How will the textbook be published?'),
      choices: [
        { id: 'oer',    label: 'Open textbook with a CC license, free download.', points: 6 },
        { id: 'oa',     label: 'Free download, but no license stated.', points: 4 },
        { id: 'low',    label: 'Affordable print/e-book (under ~$40).', points: 3 },
        { id: 'standard', label: 'Standard commercial textbook.', points: 1 },
        { id: 'access_code', label: 'Commercial with required access code.', points: 0 },
      ],
      tags: ['cost', 'license'],
    },

    // -- Reading list-specific
    {
      id: 't_reading_oa',
      appliesTo: { modes: ['teaching'], types: ['reading_list'] },
      text: (ctx) => statusVerb(ctx, 'What share of items on the reading list are free for students (OA, preprints, fair-use links)?', 'What share of items on the reading list will be free for students (OA, preprints, fair-use links)?'),
      choices: [
        { id: 'all',    label: '100%.', points: 5 },
        { id: 'most',   label: '75–99%.', points: 4 },
        { id: 'mixed',  label: '50–74%.', points: 3 },
        { id: 'few',    label: '25–49%.', points: 2 },
        { id: 'rare',   label: 'Less than 25%.', points: 1 },
        { id: 'none',   label: 'None.', points: 0 },
      ],
      tags: ['cost'],
    },
    {
      id: 't_reading_links',
      appliesTo: { modes: ['teaching'], types: ['reading_list'] },
      text: (ctx) => statusVerb(ctx, 'Does each reading on the list link to a free copy where one exists?', 'Will each reading on the list link to a free copy where one exists?'),
      choices: [
        { id: 'all',    label: 'Yes — every item has a working free link when one exists.', points: 3 },
        { id: 'most',   label: 'Most items.', points: 2 },
        { id: 'few',    label: 'A few items.', points: 1 },
        { id: 'none',   label: 'No — citations only.', points: 0 },
      ],
      tags: ['access'],
    },

    // -- Evaluation instrument extras (avoid sharing answer keys; we care about the instrument)
    {
      id: 't_eval_validated',
      appliesTo: { modes: ['teaching'], types: ['evaluation'] },
      text: (ctx) => statusVerb(ctx, 'Did you document how the instrument was built and what it measures?', 'Will you document how the instrument was built and what it measures?'),
      choices: [
        { id: 'full', label: 'Yes — learning objectives, item map, and rubric are public or shareable.', points: 3 },
        { id: 'partial', label: 'Some documentation, but not all.', points: 2 },
        { id: 'none', label: 'No.', points: 0 },
      ],
      tags: ['documentation'],
    },

    // -- Universal teaching extras
    {
      id: 't_attribution',
      appliesTo: { modes: ['teaching'] },
      statuses: ['finished', 'current'],
      text: 'Are outside materials in the work properly attributed (citation, license, link)?',
      choices: [
        { id: 'yes',   label: 'Yes — every outside item is properly attributed.', points: 2 },
        { id: 'most',  label: 'Most are.', points: 1 },
        { id: 'no',    label: 'No / inconsistent.', points: 0 },
        { id: 'na',    label: 'Not applicable — no outside materials.', points: 2 },
      ],
      tags: ['attribution'],
    },
    {
      id: 't_accessibility',
      appliesTo: { modes: ['teaching'] },
      text: (ctx) => statusVerb(ctx, 'Have you addressed accessibility (alt text, captions, readable structure)?', 'Will you address accessibility (alt text, captions, readable structure)?'),
      help: 'Accessible by default — alt text, captions, headings, descriptive links — multiplies reach.',
      choices: [
        { id: 'audited', label: 'Yes — audited; alt text and captions are in place.', points: 3 },
        { id: 'partial', label: 'Some accessibility features.', points: 2 },
        { id: 'none', label: 'No.', points: 0 },
      ],
      tags: ['accessibility'],
    },

    // ===============================================================
    // CROSS-CUTTING — applies to both modes
    // ===============================================================
    {
      id: 'x_reuse_invite',
      appliesTo: { modes: ['research', 'teaching'] },
      statuses: ['finished', 'current'],
      text: 'Does the output explicitly invite reuse with a stated contact and citation format?',
      choices: [
        { id: 'yes',  label: 'Yes — a "how to cite" + contact line is included.', points: 2 },
        { id: 'partial', label: 'One of the two.', points: 1 },
        { id: 'no',   label: 'Neither.', points: 0 },
      ],
      tags: ['reuse'],
    },
  ];

  // Compute max points per question.
  QBANK.forEach((q) => {
    q.maxPoints = Math.max(...q.choices.map((c) => c.points));
  });

  // Helper used in question text so we can phrase the same question
  // slightly differently for finished vs. planned items.
  function statusVerb(ctx, finishedText, plannedText) {
    if (!ctx) return finishedText;
    return ctx.status === 'planned' ? plannedText : finishedText;
  }

  // Filter QBANK to the questions that apply to the current context.
  function filterQuestions(ctx) {
    return QBANK.filter((q) => {
      if (q.appliesTo.modes && q.appliesTo.modes.indexOf(ctx.mode) < 0) return false;
      if (q.appliesTo.types && q.appliesTo.types.indexOf(ctx.type) < 0) return false;
      if (q.statuses && q.statuses.indexOf(ctx.status) < 0) return false;
      return true;
    });
  }

  // ----------------------------------------------------------------
  // Bands and profiles
  // ----------------------------------------------------------------
  const BANDS = [
    { id: 'very_closed', name: 'Very Closed',  min: 0.00, max: 0.20 },
    { id: 'closed',      name: 'Closed',       min: 0.20, max: 0.40 },
    { id: 'mixed',       name: 'Mixed',        min: 0.40, max: 0.60 },
    { id: 'open',        name: 'Open',         min: 0.60, max: 0.80 },
    { id: 'very_open',   name: 'Very Open',    min: 0.80, max: 1.01 },
  ];

  function bandFor(pct) {
    for (const b of BANDS) {
      if (pct >= b.min && pct < b.max) return b;
    }
    return BANDS[BANDS.length - 1];
  }

  // Profile names: clinical, descriptive, never loaded.
  // Each profile is selected based on which axes scored well or poorly.
  function profileFor(axes, mode) {
    const { access, license, reuse, transparency } = axes;
    // Helper: is X strong / weak?
    const strong = (v) => v >= 0.7;
    const weak = (v) => v <= 0.35;

    if (strong(access) && strong(license) && strong(reuse) && strong(transparency)) {
      return {
        name: 'Open by default',
        body: 'The item is reachable, reusable, well-documented, and licensed for others to build on. The next ROI comes from promoting reuse — name the file in talks, link to it in your bio, and invite citations.',
      };
    }
    if (strong(access) && weak(license)) {
      return {
        name: 'Reachable but unlicensed',
        body: 'Others can find and read the item, but they cannot legally reuse it without permission. Adding a Creative Commons license is the single highest-ROI change available here.',
      };
    }
    if (strong(access) && weak(reuse)) {
      return {
        name: 'Visible but not reusable',
        body: 'The item can be read, but the working files behind it are missing, locked, or undocumented. Posting an editable file with a short README opens up adoption by others.',
      };
    }
    if (weak(access) && strong(license)) {
      return {
        name: 'Licensed but locked',
        body: 'You hold the rights to share, but the item is not actually reachable for most readers. Deposit a free version in a public repository to activate the openness you already have.',
      };
    }
    if (weak(transparency) && strong(access)) {
      return {
        name: 'Open in form, opaque in method',
        body: 'The item is reachable, but key decisions behind it — data sources, instruments, scoring, methods — are not visible. Documentation is the lowest-cost way to raise trust and reuse.',
      };
    }
    if (weak(access) && weak(license) && weak(reuse)) {
      return {
        name: 'Mostly closed',
        body: 'Several openness levers are still unused. Pick one — usually a free deposit copy or an open license — and start there. Small moves compound.',
      };
    }
    if (mode === 'teaching' && weak(axes.cost)) {
      return {
        name: 'Costly to students',
        body: 'Required materials carry meaningful out-of-pocket cost. Replacing even one paid item with a free equivalent often improves both equity and outcomes.',
      };
    }
    return {
      name: 'Partly open',
      body: 'The item is open along some axes and closed along others. Look at the missed points below and pick one to address first — usually the cheapest concrete change is best.',
    };
  }

  // Group questions into axes for the profile.
  // Each question's tags drive which axes it contributes to.
  function computeAxes(perQ) {
    const axes = {
      access: [0, 0],
      license: [0, 0],
      reuse: [0, 0],
      transparency: [0, 0],
      cost: [0, 0],
    };
    perQ.forEach((row) => {
      const tags = row.q.tags || [];
      const addTo = (k) => { axes[k][0] += row.earned; axes[k][1] += row.q.maxPoints; };
      tags.forEach((t) => {
        if (t === 'access' || t === 'findable' || t === 'preprint') addTo('access');
        if (t === 'license' || t === 'rights' || t === 'attribution') addTo('license');
        if (t === 'reuse' || t === 'code' || t === 'data' || t === 'documentation' || t === 'reproducibility' || t === 'accessibility') addTo('reuse');
        if (t === 'transparency' || t === 'preregistration' || t === 'planning') addTo('transparency');
        if (t === 'cost') addTo('cost');
      });
    });
    const out = {};
    Object.keys(axes).forEach((k) => {
      out[k] = axes[k][1] === 0 ? null : axes[k][0] / axes[k][1];
    });
    // Treat null axes as neutral 0.5 for profile decision.
    Object.keys(out).forEach((k) => { if (out[k] == null) out[k] = 0.5; });
    return out;
  }

  // ----------------------------------------------------------------
  // Suggestion engine
  //
  // For each question where the user did not get the top-scoring
  // choice, we produce a concrete, item-specific suggestion. The
  // text of the suggestion depends on the question and on which
  // choice was picked, so advice is tailored, not generic.
  // ----------------------------------------------------------------
  const SUGGESTIONS = {
    r_access: {
      best: 'cc_licensed',
      tip: (ctx, chosen) => {
        if (chosen === 'bronze') return 'Free is good; free with a CC license is better. Attach a CC license to the open copy so others can legally reuse and adapt it.';
        return 'Post a free, CC-licensed version (preprint, postprint, or AAM) on CrimRxiv or a similar repository. This is the highest-ROI change you can make.';
      },
    },
    r_license: {
      best: 'cc-by',
      tip: (ctx, chosen) => {
        if (chosen === 'none' || chosen === 'publisher' || chosen === 'unknown') return 'Attach a Creative Commons license (CC BY is the default for open science). Without a clear license, the default is "all rights reserved," which suppresses reuse.';
        return 'Consider CC BY (or CC0) instead of more restrictive variants. NC and ND clauses block legitimate teaching, translation, and reproducibility work.';
      },
    },
    r_pid: {
      best: 'doi',
      tip: () => 'Mint a DOI by depositing the item on Zenodo, OSF, or a similar repository. DOIs survive broken URLs and are required for citation in many systems.',
    },
    r_paper_preprint: {
      best: 'crimrxiv',
      tip: (ctx, chosen) => {
        if (chosen === 'general' || chosen === 'institutional' || chosen === 'social' || chosen === 'personal') return 'Also cross-deposit on CrimRxiv — discoverability inside criminology is much higher there, and scholarly social networks and personal sites are not durable archives.';
        return 'Post a preprint on CrimRxiv. It is free, indexed by Google Scholar, and gets the work to readers immediately.';
      },
    },
    r_paper_rights: {
      best: 'policy',
      tip: (ctx, chosen) => {
        if (chosen === 'check') return 'Pair the journal’s postprint policy with a rights retention statement on your next submission. Policies change; a retention statement is portable.';
        return 'Add a rights retention statement on your next submission (one sentence in the cover letter and on the manuscript). If your institution or funder has a rights retention policy, cite it.';
      },
    },
    r_paper_data_link: {
      best: 'link_both',
      tip: () => 'Add a Data Availability Statement that points to working links or DOIs for both data and code.',
    },
    r_data_share: {
      best: 'repo_open',
      tip: (ctx, chosen) => {
        if (chosen === 'cannot_share') return 'Where possible, share a deidentified subset, synthetic data, or aggregate tables. Document exactly what cannot be shared and why.';
        return 'Deposit the data in a trusted criminology-friendly repository (ICPSR / NACJD, OSF, Dataverse, or Zenodo). Personal sites disappear; repositories persist.';
      },
    },
    r_data_docs: {
      best: 'full',
      tip: () => 'Write a one-page codebook (variable names, values, units, missingness) and a short README (provenance, dates, who collected the data). Both are short and dramatically increase reuse.',
    },
    r_code_share: {
      best: 'repo_doi',
      tip: (ctx, chosen) => {
        if (chosen === 'repo') return 'Archive a snapshot of the repo on Zenodo to mint a DOI. It is one button and makes the code citable.';
        return 'Move the code to a public GitHub/GitLab repo and archive a snapshot on Zenodo for a DOI.';
      },
    },
    r_code_runs: {
      best: 'one_command',
      tip: () => 'Add a README that lists every dependency, plus an environment file (renv.lock, requirements.txt, environment.yml). Aim for "clone, run one command, get the result."',
    },
    r_prereg_where: {
      best: 'rr',
      tip: (ctx, chosen) => {
        if (chosen === 'private') return 'Make the preregistration public on OSF. Embargoes are sometimes appropriate, but default to public so the date stamp is visible.';
        return 'Consider a Registered Report for the next paper — peer review of the design before data collection sharply reduces publication bias.';
      },
    },
    r_prereg_specifics: {
      best: 'full',
      tip: () => 'Strengthen the preregistration by adding operational decision rules for each hypothesis (exact sample size logic, exclusion criteria, analysis steps).',
    },
    r_project_dmp: {
      best: 'yes_public',
      tip: () => 'Write a short data-management / open-science plan (one page is enough) and post it on OSF alongside the project.',
    },
    t_cost: {
      best: 'zero',
      tip: (ctx, chosen) => {
        if (chosen === 'low' || chosen === 'mid') return 'Look for an OA equivalent of the most expensive remaining item and swap it in. Even one swap can move a course into the no-cost band.';
        return 'Build a no-cost reading list using OA articles, library e-books, public-domain texts, and OER. Most criminology courses can be fully no-cost.';
      },
    },
    t_license: {
      best: 'cc-by',
      tip: (ctx, chosen) => {
        if (chosen === 'all_rights' || chosen === 'none' || chosen === 'unknown') return 'Add a Creative Commons license to the materials you created. CC BY is the standard for OER; CC BY-SA and CC BY-NC are also common.';
        return 'Move from a more restrictive CC variant toward CC BY where possible — ND in particular blocks adaptation for new courses and audiences.';
      },
    },
    t_access: {
      best: 'oer_repo',
      tip: (ctx, chosen) => {
        if (chosen === 'lms_closed' || chosen === 'lms_catalog') return 'Move the material out of LMS-only channels and into a public, indexed location like CrimRxiv or OER Commons. LMS catalogs are open to a club, not to the world.';
        return 'Deposit on an OER repository (CrimRxiv, OER Commons, MERLOT, Pressbooks where appropriate). Repositories add discoverability and persistence your site cannot.';
      },
    },
    t_course_oer: {
      best: 'all',
      tip: () => 'Identify the single most expensive required item and find a no-cost replacement (library copy, OER, OA article). Repeat until every required item is free.',
    },
    t_course_shell: {
      best: 'shell_open',
      tip: () => 'Export the course as a Common Cartridge (or publish via Pressbooks) so another instructor can import it in one step.',
    },
    t_syllabus_public: {
      best: 'public_open',
      tip: () => 'Post the syllabus on a personal page or department site with a CC license. Other instructors copy from public syllabi constantly.',
    },
    t_unit_reusable: {
      best: 'turnkey',
      tip: () => 'Provide the unit in editable form (DOCX, Markdown, or H5P) along with a short instructor note that states learning objectives, prerequisites, and time required.',
    },
    t_textbook_oer: {
      best: 'oer',
      tip: (ctx, chosen) => {
        if (chosen === 'access_code') return 'Replace the access-code edition with a Pressbooks or OpenStax-style open edition. Access codes are the single biggest barrier to no-cost.';
        return 'Consider an open-licensed edition (Pressbooks, Rebus, OpenStax) for the next revision. Many criminology open textbooks now exist as models.';
      },
    },
    t_reading_oa: {
      best: 'all',
      tip: () => 'For each non-free item, search for an OA equivalent — a preprint, an author postprint, or an OA review covering the same ground.',
    },
    t_reading_links: {
      best: 'all',
      tip: () => 'Audit the reading list once and add direct free links (preprint, OA copy, library e-version) next to every citation that has one.',
    },
    t_eval_validated: {
      best: 'full',
      tip: () => 'Write a one-page rubric and item map: what each item measures, why it was chosen, and how it is scored. You can share this without sharing the answer key.',
    },
    t_attribution: {
      best: 'yes',
      tip: () => 'Walk through outside items once and add citation, license, and link for each. Good attribution protects you and models scholarly practice for students.',
    },
    t_accessibility: {
      best: 'audited',
      tip: () => 'Run a quick accessibility pass: alt text on images, captions on video, descriptive link text, real headings. This is short work with disproportionate reach.',
    },

    x_reuse_invite: {
      best: 'yes',
      tip: () => 'Add two short lines to the output: a recommended citation and a contact for reuse questions. This converts passive availability into active reuse.',
    },
  };

  // ----------------------------------------------------------------
  // App state
  // ----------------------------------------------------------------
  const state = {
    mode: null,
    status: null,
    type: null,
    itemName: '',
    personName: '',
    answers: {}, // qId -> choiceId
    stepIdx: 0,
    steps: [],   // ordered list of step descriptors
  };

  // Steps are dynamically generated based on what we know so far.
  // Step descriptor: { kind: 'mode'|'status'|'type'|'name'|'q', q?: question }
  function rebuildSteps() {
    const steps = [
      { kind: 'mode' },
      { kind: 'status' },
      { kind: 'type' },
      { kind: 'name' },
    ];
    if (state.mode && state.status && state.type) {
      const qs = filterQuestions({ mode: state.mode, status: state.status, type: state.type });
      qs.forEach((q) => steps.push({ kind: 'q', q }));
    }
    state.steps = steps;
  }

  // ----------------------------------------------------------------
  // DOM refs
  // ----------------------------------------------------------------
  const els = {
    progressFill: $('progress-fill'),
    progressStep: $('progress-step'),
    progressTotal: $('progress-total'),
    quizCard: $('quiz-card'),
    btnBack: $('btn-back'),
    btnNext: $('btn-next'),
    btnRestartMid: $('btn-restart-mid'),
    quiz: $('quiz'),
    results: $('results'),
    bandCard: $('band-card'),
    itemRecap: $('item-recap'),
    suggestions: $('suggestions'),
    scoringBody: $('scoring-details-body'),
    downloads: $('downloads'),
    btnRestart: $('btn-restart'),
  };

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  function render() {
    rebuildSteps();
    const total = state.steps.length;
    const idx = Math.min(state.stepIdx, total - 1);
    const step = state.steps[idx];

    // progress
    els.progressTotal.textContent = total;
    els.progressStep.textContent = idx + 1;
    els.progressFill.style.width = ((idx) / Math.max(1, total - 1) * 100) + '%';

    // back button
    els.btnBack.disabled = idx === 0;
    els.btnRestartMid.hidden = idx === 0;

    // render the step
    if (!step) return;
    if (step.kind === 'mode')   els.quizCard.innerHTML = renderModeStep();
    if (step.kind === 'status') els.quizCard.innerHTML = renderStatusStep();
    if (step.kind === 'type')   els.quizCard.innerHTML = renderTypeStep();
    if (step.kind === 'name')   els.quizCard.innerHTML = renderNameStep();
    if (step.kind === 'q')      els.quizCard.innerHTML = renderQuestionStep(step.q);

    // wire up listeners after innerHTML swap
    wireStepHandlers(step);
    refreshNextEnabled(step);
  }

  function renderModeStep() {
    return `
      <div class="q-eyebrow">Step 1 — Choose one</div>
      <h2 class="q-title">Are you assessing a research output or a teaching output?</h2>
      <p class="q-help">Pick the one that best fits the specific item you have in mind. You can run the tool again for another output later.</p>
      <div class="option-grid" role="radiogroup">
        ${MODES.map((m) => `
          <label class="option">
            <input type="radio" name="mode" value="${m.id}" ${state.mode === m.id ? 'checked' : ''}>
            <div class="option-body">
              <span class="option-label">${escapeHtml(m.label)}</span>
              <span class="option-help">${escapeHtml(m.help)}</span>
            </div>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderStatusStep() {
    return `
      <div class="q-eyebrow">Step 2 — Choose one</div>
      <h2 class="q-title">Is the item finished, current, or planned?</h2>
      <p class="q-help">This changes which questions we ask. Finished items get a full assessment; current and planned items get a forward-looking version.</p>
      <div class="option-grid" role="radiogroup">
        ${STATUSES.map((s) => `
          <label class="option">
            <input type="radio" name="status" value="${s.id}" ${state.status === s.id ? 'checked' : ''}>
            <div class="option-body">
              <span class="option-label">${escapeHtml(s.label)}</span>
              <span class="option-help">${escapeHtml(s.help)}</span>
            </div>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderTypeStep() {
    const types = ITEM_TYPES[state.mode] || [];
    return `
      <div class="q-eyebrow">Step 3 — Choose one</div>
      <h2 class="q-title">What kind of ${state.mode === 'research' ? 'research' : 'teaching'} output is it?</h2>
      <p class="q-help">If more than one fits, pick the closest. The question set adjusts to the type you choose.</p>
      <div class="option-grid" role="radiogroup">
        ${types.map((t) => `
          <label class="option">
            <input type="radio" name="type" value="${t.id}" ${state.type === t.id ? 'checked' : ''}>
            <div class="option-body">
              <span class="option-label">${escapeHtml(t.label)}</span>
              <span class="option-help">${escapeHtml(t.help)}</span>
            </div>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderNameStep() {
    return `
      <div class="q-eyebrow">Step 4 — Name the item</div>
      <h2 class="q-title">What do you call this ${escapeHtml(typeLabel(state.type) || 'item')}?</h2>
      <p class="q-help">A short, recognizable label — a paper title, a course number and name, a project codename. You can edit this at the end before downloading anything.</p>
      <div class="freetext-block">
        <textarea
          id="item-name-input"
          class="freetext-input text-input-single"
          maxlength="160"
          placeholder="${escapeHtml(namePlaceholder(state.type))}"
          aria-label="Item name"
        >${escapeHtml(state.itemName)}</textarea>
      </div>
    `;
  }

  // ---- Multi-select helpers ----------------------------------------
  // state.answers[q.id] is a string id for single-select questions,
  // or an array of ids for multi-select questions. These helpers
  // normalize that so the rest of the app can treat both uniformly.
  function getSelectedIds(q) {
    const v = state.answers[q.id];
    if (Array.isArray(v)) return v;
    if (v == null || v === '') return [];
    return [v];
  }
  function getSelectedChoices(q) {
    const ids = getSelectedIds(q);
    return ids.map((id) => q.choices.find((c) => c.id === id)).filter(Boolean);
  }
  function getBestSelectedChoice(q) {
    const cs = getSelectedChoices(q);
    if (cs.length === 0) return null;
    return cs.reduce((a, b) => (b.points > a.points ? b : a));
  }

  function renderQuestionStep(q) {
    const ctx = { mode: state.mode, status: state.status, type: state.type };
    const text = typeof q.text === 'function' ? q.text(ctx) : q.text;
    const help = q.help || '';
    const selectedIds = new Set(getSelectedIds(q));
    const inputType = q.multi ? 'checkbox' : 'radio';
    const groupRole = q.multi ? 'group' : 'radiogroup';
    return `
      <div class="q-eyebrow">Item: ${escapeHtml(state.itemName) || '—'}</div>
      <h2 class="q-title">${escapeHtml(text)}</h2>
      ${help ? `<p class="q-help">${escapeHtml(help)}</p>` : ''}
      <div class="option-list" role="${groupRole}">
        ${q.choices.map((c) => `
          <label class="option">
            <input type="${inputType}" name="q-${q.id}" value="${c.id}" ${selectedIds.has(c.id) ? 'checked' : ''}>
            <div class="option-body">
              <span class="option-label">${escapeHtml(c.label)}</span>
            </div>
          </label>
        `).join('')}
      </div>
    `;
  }

  function wireStepHandlers(step) {
    if (step.kind === 'mode') {
      els.quizCard.querySelectorAll('input[name="mode"]').forEach((el) => {
        el.addEventListener('change', () => {
          if (state.mode !== el.value) {
            state.mode = el.value;
            state.type = null; // reset dependent
            state.answers = {};
          }
          refreshNextEnabled(step);
        });
      });
    } else if (step.kind === 'status') {
      els.quizCard.querySelectorAll('input[name="status"]').forEach((el) => {
        el.addEventListener('change', () => {
          if (state.status !== el.value) {
            state.status = el.value;
            state.answers = {};
          }
          refreshNextEnabled(step);
        });
      });
    } else if (step.kind === 'type') {
      els.quizCard.querySelectorAll('input[name="type"]').forEach((el) => {
        el.addEventListener('change', () => {
          if (state.type !== el.value) {
            state.type = el.value;
            state.answers = {};
          }
          refreshNextEnabled(step);
        });
      });
    } else if (step.kind === 'name') {
      const input = $('item-name-input');
      input.addEventListener('input', () => {
        state.itemName = input.value;
        refreshNextEnabled(step);
      });
      // press Enter to advance
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (canAdvance(step)) goNext();
        }
      });
      input.focus();
    } else if (step.kind === 'q') {
      const q = step.q;
      const inputs = els.quizCard.querySelectorAll(`input[name="q-${q.id}"]`);
      inputs.forEach((el) => {
        el.addEventListener('change', () => {
          if (q.multi) {
            const checked = Array.from(inputs).filter((i) => i.checked).map((i) => i.value);
            state.answers[q.id] = checked;
          } else {
            state.answers[q.id] = el.value;
          }
          refreshNextEnabled(step);
        });
      });
    }
  }

  function canAdvance(step) {
    if (step.kind === 'mode')   return !!state.mode;
    if (step.kind === 'status') return !!state.status;
    if (step.kind === 'type')   return !!state.type;
    if (step.kind === 'name')   return state.itemName.trim().length > 0;
    if (step.kind === 'q')      return getSelectedIds(step.q).length > 0;
    return false;
  }

  function refreshNextEnabled(step) {
    els.btnNext.disabled = !canAdvance(step);
    // change button label on final step
    const total = state.steps.length;
    if (state.stepIdx >= total - 1) {
      els.btnNext.textContent = 'See my result →';
    } else {
      els.btnNext.textContent = 'Next →';
    }
  }

  function goNext() {
    rebuildSteps();
    if (state.stepIdx >= state.steps.length - 1) {
      // finish
      finish();
      return;
    }
    state.stepIdx += 1;
    render();
  }

  function goBack() {
    if (state.stepIdx === 0) return;
    state.stepIdx -= 1;
    render();
  }

  function restart() {
    state.mode = null;
    state.status = null;
    state.type = null;
    state.itemName = '';
    state.personName = '';
    state.answers = {};
    state.stepIdx = 0;
    els.results.hidden = true;
    els.quiz.hidden = false;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ----------------------------------------------------------------
  // Helpers for labels
  // ----------------------------------------------------------------
  function typeLabel(typeId) {
    const list = ITEM_TYPES[state.mode] || [];
    const t = list.find((x) => x.id === typeId);
    return t ? t.label.toLowerCase() : '';
  }
  function statusLabel(s) {
    const v = STATUSES.find((x) => x.id === s);
    return v ? v.label : '';
  }
  function modeLabel(m) {
    const v = MODES.find((x) => x.id === m);
    return v ? v.label : '';
  }
  function namePlaceholder(typeId) {
    const map = {
      paper: 'e.g., "Place-Based Hot Spots Replication, 2024 draft"',
      project: 'e.g., "Atlanta Street Codes Project"',
      data: 'e.g., "GA Survey of Recently Released Adults, Wave 2"',
      code: 'e.g., "burglary-spatial-model R package"',
      preregistration: 'e.g., "Drug-court completion analysis preregistration"',
      other_research: 'e.g., "ASC 2025 plenary slides on proterrence"',
      course: 'e.g., "CRJU 3050 Criminal Justice in the U.S., Fall 2025"',
      syllabus: 'e.g., "Theories of Crime — Spring 2026 syllabus"',
      assignment: 'e.g., "Crime Map Critique assignment"',
      lecture: 'e.g., "Routine Activity Theory lecture (Week 4)"',
      module: 'e.g., "Restorative Justice unit, 3 sessions"',
      textbook: 'e.g., "Open Criminology: An Introduction"',
      reading_list: 'e.g., "Cybersecurity & Crime — comprehensive reading list"',
      course_shell: 'e.g., "Open Intro Crim — Canvas shell"',
      evaluation: 'e.g., "Midterm exam, CRJU 3050"',
      other_teaching: 'e.g., "Lecture capture series — Police History"',
    };
    return map[typeId] || 'A short, recognizable name';
  }

  // ----------------------------------------------------------------
  // Scoring + finish
  // ----------------------------------------------------------------
  function finish() {
    const result = compute();
    renderResults(result);
    els.quiz.hidden = true;
    els.results.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function compute() {
    const ctx = { mode: state.mode, status: state.status, type: state.type };
    const qs = filterQuestions(ctx);
    const perQ = qs.map((q) => {
      const selectedChoices = getSelectedChoices(q);
      const bestSelected = getBestSelectedChoice(q);
      // For multi-select questions, the score is the max of the selected
      // choices (openness is set by the most open venue, not multiplied
      // by number of venues). For single-select it's just the one choice.
      const choice = bestSelected;
      const earned = bestSelected ? bestSelected.points : 0;
      const chosen = bestSelected ? bestSelected.id : undefined;
      const best = q.choices.find((c) => c.points === q.maxPoints);
      const lostPoints = q.maxPoints - earned;
      return { q, chosen, choice, selectedChoices, earned, best, lostPoints };
    });
    const earnedSum = perQ.reduce((s, r) => s + r.earned, 0);
    const maxSum = perQ.reduce((s, r) => s + r.q.maxPoints, 0);
    const pct = maxSum === 0 ? 0 : earnedSum / maxSum;
    const band = bandFor(pct);
    const axes = computeAxes(perQ);
    const profile = profileFor(axes, state.mode);

    return {
      perQ, earnedSum, maxSum, pct, band, profile, axes, ctx,
    };
  }

  // ----------------------------------------------------------------
  // Results page rendering
  // ----------------------------------------------------------------
  function renderResults(r) {
    renderBandCard(r);
    renderItemRecap(r);
    renderSuggestions(r);
    renderScoringDetails(r);
    renderDownloads(r);
  }

  function renderBandCard(r) {
    const bandIdx = BANDS.findIndex((b) => b.id === r.band.id);
    const labels = BANDS.map((b, i) => `<span class="${i === bandIdx ? 'active' : ''}">${b.name}</span>`).join('');
    els.bandCard.innerHTML = `
      <div class="band-card-eyebrow">Openness band</div>
      <div class="band-row">
        <div class="band-name">${escapeHtml(r.band.name)}</div>
        <div class="band-score">
          <div class="band-score-value">${Math.round(r.pct * 100)}%</div>
          <div class="band-score-label">${r.earnedSum} of ${r.maxSum} points</div>
        </div>
      </div>
      <div class="band-scale">
        <div class="band-scale-track">
          <div class="band-scale-fill" style="width:${Math.round(r.pct * 100)}%"></div>
        </div>
        <div class="band-scale-labels">${labels}</div>
      </div>

      <div class="band-profile">
        <div class="band-profile-eyebrow">Profile</div>
        <div class="band-profile-name">${escapeHtml(r.profile.name)}</div>
        <p class="band-profile-body">${escapeHtml(r.profile.body)}</p>
      </div>
    `;
  }

  function renderItemRecap(r) {
    els.itemRecap.innerHTML = `
      <div class="item-recap-meta">
        <span class="tag tag-accent">${escapeHtml(modeLabel(state.mode))}</span>
        <span class="tag">${escapeHtml(statusLabel(state.status))}</span>
        <span class="tag">${escapeHtml(typeLabel(state.type))}</span>
      </div>
      <label class="item-recap-label" for="item-name-edit">Item name (you can refine this before downloading)</label>
      <textarea
        id="item-name-edit"
        class="freetext-input text-input-single"
        maxlength="160"
        aria-label="Item name"
      >${escapeHtml(state.itemName)}</textarea>
    `;
    const input = $('item-name-edit');
    input.addEventListener('input', () => {
      state.itemName = input.value;
      // refresh any place that prints the name
      const certNameOut = $('cert-preview-item');
      if (certNameOut) certNameOut.textContent = state.itemName || '—';
    });
  }

  function renderSuggestions(r) {
    // Sort missed points by how many points they lost (most painful first).
    const missed = r.perQ
      .filter((row) => row.lostPoints > 0)
      .sort((a, b) => b.lostPoints - a.lostPoints);
    if (missed.length === 0) {
      els.suggestions.innerHTML = `
        <h3>Concrete next steps</h3>
        <p class="suggestions-none">You picked the top-scoring choice on every applicable question. The remaining ROI here is in advocacy: tell other people the item exists, invite reuse, and report adoption.</p>
      `;
      return;
    }
    const items = missed.slice(0, 6).map((row) => {
      const s = SUGGESTIONS[row.q.id];
      if (!s) return '';
      const tip = s.tip({ mode: state.mode, status: state.status, type: state.type }, row.chosen);
      return `
        <li class="suggestion-item">
          <strong>${escapeHtml(shortQuestionLabel(row.q))}.</strong>
          ${escapeHtml(tip)}
          <span class="suggestion-points">+${row.lostPoints} pts available</span>
        </li>
      `;
    }).filter(Boolean).join('');
    els.suggestions.innerHTML = `
      <h3>Concrete next steps</h3>
      <p class="suggestions-help">Ordered by how much openness each change would add. Start with one. The cheapest move is usually the highest-ROI one.</p>
      <ol class="suggestion-list">${items}</ol>
    `;
  }

  // Format the user's answer for display. For multi-select questions,
  // join every selected choice label with a bullet so the user sees
  // everything they picked, with the highest-scoring one first.
  function formatRowAnswer(row) {
    if (row.q.multi) {
      const cs = (row.selectedChoices || []).slice().sort((a, b) => b.points - a.points);
      if (cs.length === 0) return '(no answer)';
      return cs.map((c) => c.label).join(' · ');
    }
    return row.choice ? row.choice.label : '(no answer)';
  }

  // Short, scannable label for each question to head a suggestion bullet.
  function shortQuestionLabel(q) {
    const map = {
      r_access: 'Open access',
      r_license: 'License',
      r_pid: 'Persistent identifier',
      r_paper_preprint: 'Preprint',
      r_paper_rights: 'Rights retention',
      r_paper_data_link: 'Data / code links in the paper',
      r_data_share: 'Data sharing location',
      r_data_docs: 'Codebook / README',
      r_code_share: 'Code repository',
      r_code_runs: 'Reproducibility setup',
      r_prereg_where: 'Where the preregistration lives',
      r_prereg_specifics: 'Preregistration specifics',
      r_project_dmp: 'Open-science plan',

      t_cost: 'Cost to students',
      t_license: 'License on your materials',
      t_access: 'Where the materials live',
      t_course_oer: 'Share of free required items',
      t_course_shell: 'Reusable course shell',
      t_syllabus_public: 'Public syllabus',
      t_unit_reusable: 'Reusability for other instructors',
      t_textbook_oer: 'Textbook openness',
      t_reading_oa: 'Free items on the reading list',
      t_reading_links: 'Working free links on the list',
      t_eval_validated: 'Instrument documentation',
      t_attribution: 'Attribution of outside materials',
      t_accessibility: 'Accessibility',

      x_reuse_invite: 'Invitation to reuse',
    };
    return map[q.id] || 'Improvement opportunity';
  }

  function renderScoringDetails(r) {
    // Group rows by axis for legibility.
    const axesGroups = {
      'Access & findability': ['access', 'findable', 'preprint'],
      'License & rights':     ['license', 'rights', 'attribution'],
      'Reuse, data, code, docs': ['reuse', 'code', 'data', 'documentation', 'reproducibility', 'accessibility'],
      'Transparency & planning': ['transparency', 'preregistration', 'planning'],
      'Cost to students':     ['cost'],
      'Impact':               ['impact'],
    };
    const sections = [];
    Object.keys(axesGroups).forEach((label) => {
      const wanted = axesGroups[label];
      const rows = r.perQ.filter((row) => (row.q.tags || []).some((t) => wanted.indexOf(t) >= 0));
      if (rows.length === 0) return;
      const earned = rows.reduce((s, x) => s + x.earned, 0);
      const max = rows.reduce((s, x) => s + x.q.maxPoints, 0);
      sections.push(`
        <div class="score-section">
          <div class="score-section-head">
            <h4>${escapeHtml(label)}</h4>
            <span class="score-section-total">${earned} / ${max} pts</span>
          </div>
          ${rows.map((row) => `
            <div class="score-row ${row.earned === row.q.maxPoints ? 'earned' : 'missed'}">
              <div class="score-row-text">
                <strong>${escapeHtml(shortQuestionLabel(row.q))}.</strong>
                <div class="score-row-text-sub">${escapeHtml(formatRowAnswer(row))}</div>
              </div>
              <div class="score-row-points"><strong>${row.earned}</strong> / ${row.q.maxPoints}</div>
            </div>
          `).join('')}
        </div>
      `);
    });
    els.scoringBody.innerHTML = `
      <div class="scoring-breakdown">${sections.join('')}</div>
    `;
  }

  function renderDownloads(r) {
    const certEligible = state.status === 'finished' && (r.band.id === 'open' || r.band.id === 'very_open');
    const certNotEligibleReason = state.status !== 'finished'
      ? 'Certificates are available only for finished outputs. Current and planned items are not yet ready for a public certificate.'
      : `Certificates are awarded only at Open or Very Open. Your current band is ${r.band.name}. The "Concrete next steps" panel above lists the changes most likely to move it.`;

    els.downloads.innerHTML = `
      <h3>Download a summary</h3>
      <p class="downloads-help">A short, printable summary of this assessment — band, profile, suggestions, and your scoring breakdown. Nothing is sent anywhere; the file is built in your browser.</p>
      <div class="download-actions">
        <button class="btn btn-primary" id="btn-download-summary">Download summary (HTML)</button>
        <button class="btn btn-secondary" id="btn-print">Print</button>
      </div>

      <div class="cert-block">
        <h3>Certificate</h3>
        ${certEligible ? `
          <p class="downloads-help">Your output qualifies for a CrimConsortium certificate. Enter your name and confirm the item name, then download a printable certificate.</p>
          <div class="cert-form">
            <label>Your name
              <input type="text" class="freetext-input text-input-single" id="cert-person-name" maxlength="120" placeholder="Full name as you'd like it printed" value="${escapeHtml(state.personName)}">
            </label>
            <label>Item name
              <input type="text" class="freetext-input text-input-single" id="cert-item-name" maxlength="160" value="${escapeHtml(state.itemName)}">
            </label>
          </div>
          <div class="download-actions">
            <button class="btn btn-primary" id="btn-download-cert">Download certificate (HTML)</button>
          </div>
        ` : `
          <div class="cert-locked">${escapeHtml(certNotEligibleReason)}</div>
        `}
      </div>
    `;

    $('btn-download-summary').addEventListener('click', () => downloadSummary(r));
    $('btn-print').addEventListener('click', () => window.print());
    if (certEligible) {
      const personIn = $('cert-person-name');
      const itemIn = $('cert-item-name');
      personIn.addEventListener('input', () => { state.personName = personIn.value; });
      itemIn.addEventListener('input', () => { state.itemName = itemIn.value; });
      $('btn-download-cert').addEventListener('click', () => downloadCertificate(r));
    }
  }

  // ----------------------------------------------------------------
  // Downloads (built fully in browser; no network)
  //
  // We produce standalone HTML files with inline CSS so they print
  // well and look at home alongside the rest of the CrimConsortium
  // family. Nothing leaves the browser.
  // ----------------------------------------------------------------
  function downloadFile(filename, html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFilename(s) {
    return (s || 'assessment')
      .replace(/[^\w\d\-_. ]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'assessment';
  }

  function downloadSummary(r) {
    const date = fmtDate(new Date());
    const item = state.itemName || '—';
    const ctxLabel = `${modeLabel(state.mode)} · ${statusLabel(state.status)} · ${typeLabel(state.type)}`;
    const missed = r.perQ.filter((row) => row.lostPoints > 0).sort((a, b) => b.lostPoints - a.lostPoints);
    const suggestionsHtml = missed.slice(0, 6).map((row) => {
      const s = SUGGESTIONS[row.q.id];
      const tip = s ? s.tip({ mode: state.mode, status: state.status, type: state.type }, row.chosen) : '';
      return `<li><strong>${escapeHtml(shortQuestionLabel(row.q))}.</strong> ${escapeHtml(tip)} <span class="pts">+${row.lostPoints} pts</span></li>`;
    }).join('') || '<li>No missed points on the applicable questions.</li>';

    const breakdown = r.perQ.map((row) => `
      <tr>
        <td>${escapeHtml(shortQuestionLabel(row.q))}</td>
        <td>${escapeHtml(formatRowAnswer(row))}</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums;">${row.earned} / ${row.q.maxPoints}</td>
      </tr>
    `).join('');

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Open Criminology — Assessment Summary — ${escapeHtml(item)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; color:#0e0e0e; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color:#5a5750; }
  h1 { font-size: 1.6rem; margin: .25rem 0 .5rem; }
  h2 { font-size: 1.15rem; margin-top: 1.8rem; border-bottom: 1px solid #d4cfc2; padding-bottom: .25rem; }
  .meta { color:#5a5750; font-size: .92rem; }
  .band { display:flex; align-items: baseline; gap: 1rem; margin-top: .75rem; }
  .band-name { color: #f68212; font-weight: 600; font-size: 1.6rem; }
  .band-pct { color:#0e0e0e; font-family: ui-monospace, monospace; }
  .profile { margin: .75rem 0 1rem; padding: .75rem 1rem; border-left: 2px solid #f68212; background: rgba(246,130,18,.06); }
  ol { padding-left: 1.25rem; }
  li { margin-bottom: .5rem; }
  .pts { font-family: ui-monospace, monospace; font-size: .8rem; color:#5a5750; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { padding: .4rem .5rem; border-bottom: 1px solid #ece8df; vertical-align: top; }
  th { text-align: left; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color:#5a5750; }
  .footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #d4cfc2; font-size: .8rem; color:#5a5750; }
  a { color: #9c4f08; }
</style></head><body>
  <div class="eyebrow">CrimConsortium — Is Your Criminology Open?</div>
  <h1>${escapeHtml(item)}</h1>
  <div class="meta">${escapeHtml(ctxLabel)} · Generated ${escapeHtml(date)}</div>

  <h2>Openness band</h2>
  <div class="band">
    <span class="band-name">${escapeHtml(r.band.name)}</span>
    <span class="band-pct">${Math.round(r.pct * 100)}% — ${r.earnedSum} / ${r.maxSum} points</span>
  </div>

  <div class="profile">
    <strong>${escapeHtml(r.profile.name)}.</strong> ${escapeHtml(r.profile.body)}
  </div>

  <h2>Concrete next steps</h2>
  <ol>${suggestionsHtml}</ol>

  <h2>Scoring breakdown</h2>
  <table>
    <thead><tr><th>Question</th><th>Answer</th><th>Points</th></tr></thead>
    <tbody>${breakdown}</tbody>
  </table>

  <div class="footer">
    A <a href="https://crimconsortium.com">CrimConsortium</a> tool —
    <a href="https://open.crimconsortium.com/">Is Your Criminology Open?</a>.
    Browse and post open criminology at <a href="https://crimrxiv.com">CrimRxiv</a>.
    This summary was generated entirely in the user's browser. No data was saved or sent.
  </div>
</body></html>`;

    downloadFile(`OpenCriminology_${safeFilename(item)}.html`, html);
  }

  function downloadCertificate(r) {
    const person = (state.personName || '').trim();
    const item = (state.itemName || '').trim();
    if (!person) {
      const input = $('cert-person-name');
      if (input) {
        input.focus();
        input.style.borderColor = 'var(--color-primary)';
      }
      return;
    }
    if (!item) {
      const input = $('cert-item-name');
      if (input) {
        input.focus();
        input.style.borderColor = 'var(--color-primary)';
      }
      return;
    }

    const date = fmtDate(new Date());
    const ctxLabel = `${modeLabel(state.mode)} · ${typeLabel(state.type)}`;

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Open Criminology Certificate — ${escapeHtml(item)}</title>
<style>
  @page { size: letter landscape; margin: 0; }
  body { margin: 0; background: #f7f5f1; font-family: Georgia, serif; color:#0e0e0e; }
  .cert {
    width: 1056px; height: 768px;
    margin: 0 auto; background: #fff;
    border: 1px solid #d4cfc2;
    padding: 56px 72px; position: relative;
    display: flex; flex-direction: column;
    box-sizing: border-box;
  }
  .cert::before {
    content: ""; position: absolute; top: 24px; left: 24px; right: 24px; bottom: 24px;
    border: 1px solid #d4cfc2; pointer-events: none;
  }
  .cert::after {
    content: ""; position: absolute; top: 28px; left: 28px; right: 28px; bottom: 28px;
    border: 2px solid #f68212; pointer-events: none;
  }
  .eyebrow {
    font-family: ui-monospace, monospace;
    font-size: 12px; letter-spacing: .25em; text-transform: uppercase;
    color: #5a5750; text-align: center; margin-bottom: 32px;
  }
  .title {
    font-size: 44px; font-weight: 600; text-align: center;
    letter-spacing: -0.01em; margin-bottom: 16px;
  }
  .subtitle {
    font-size: 16px; color:#5a5750; text-align: center; margin-bottom: 48px;
  }
  .body { text-align: center; flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .awarded { font-size: 14px; color:#5a5750; letter-spacing: .12em; text-transform: uppercase; }
  .person {
    font-size: 56px; font-weight: 600; color:#f68212; margin: 12px 0 24px;
    letter-spacing: -0.01em;
  }
  .for { font-size: 14px; color:#5a5750; letter-spacing: .12em; text-transform: uppercase; }
  .item {
    font-size: 28px; font-style: italic; font-weight: 500; margin: 12px 0;
    max-width: 800px; margin-left: auto; margin-right: auto; line-height: 1.25;
  }
  .ctx {
    font-family: ui-monospace, monospace; font-size: 12px; color:#5a5750;
    text-transform: uppercase; letter-spacing: .1em; margin-top: 8px;
  }
  .footer {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-top: 32px; font-size: 12px; color:#5a5750;
  }
  .footer .left, .footer .right { max-width: 320px; }
  .band-pill {
    display: inline-block; padding: 6px 14px; border: 2px solid #f68212;
    color: #f68212; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    font-family: ui-monospace, monospace; font-size: 13px; border-radius: 4px;
  }
  .sig {
    margin-top: 8px; font-family: Georgia, serif; font-style: italic;
    border-top: 1px solid #beb9aa; padding-top: 6px; width: 220px;
    color: #0e0e0e;
  }
  .pct { font-family: ui-monospace, monospace; }
  @media print {
    body { background: #fff; }
    .cert { border: none; }
  }
</style></head><body>
  <div class="cert">
    <div class="eyebrow">CrimConsortium — Open Criminology</div>
    <div class="title">Certificate of Open Practice</div>
    <div class="subtitle">Awarded for a finished criminology output that meets the Open or Very Open band on the Open Criminology Self-Assessment Tool.</div>

    <div class="body">
      <div class="awarded">This certifies that</div>
      <div class="person">${escapeHtml(person)}</div>
      <div class="for">has produced the following open criminology output:</div>
      <div class="item">${escapeHtml(item)}</div>
      <div class="ctx">${escapeHtml(ctxLabel)}</div>
      <div style="margin-top:24px;">
        <span class="band-pill">${escapeHtml(r.band.name)} · <span class="pct">${Math.round(r.pct * 100)}%</span></span>
      </div>
    </div>

    <div class="footer">
      <div class="left">
        <div>Issued ${escapeHtml(date)}</div>
        <div>This certificate is self-issued by the assessment tool. CrimConsortium endorses the framework and the practice, not the specific output.</div>
      </div>
      <div class="right" style="text-align:right;">
        <div class="sig">CrimConsortium · crimconsortium.com</div>
      </div>
    </div>
  </div>
</body></html>`;

    downloadFile(`OpenCriminology_Certificate_${safeFilename(item)}.html`, html);
  }

  // ----------------------------------------------------------------
  // Wire up global nav + start
  // ----------------------------------------------------------------
  els.btnNext.addEventListener('click', () => {
    rebuildSteps();
    const step = state.steps[state.stepIdx];
    if (!canAdvance(step)) return;
    if (state.stepIdx >= state.steps.length - 1) {
      finish();
    } else {
      state.stepIdx += 1;
      render();
    }
  });
  els.btnBack.addEventListener('click', goBack);
  els.btnRestart.addEventListener('click', restart);
  els.btnRestartMid.addEventListener('click', restart);

  // initial render
  render();
})();
