// seed-legal.js — pushes all 9 legal documents to Supabase
// node scripts/seed-legal.js

const SB_URL  = process.env.SUPABASE_URL || 'https://kicdjdxxdqtmetphipnn.supabase.co';
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_KEY) { console.error('Error: SUPABASE_SERVICE_ROLE_KEY env var is required'); process.exit(1); }

const DOCS = [

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'privacy_policy',
  title: 'Privacy Policy',
  version: '1.0',
  content: `PRIVACY POLICY
Project Sovereign — Howard Henry, London
Effective Date: 20 March 2026 | Version 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. WHO WE ARE

Project Sovereign ("Sovereign", "we", "us", "our") is an AI-native mergers and acquisitions intelligence platform operated by Howard Henry, a sole trader based in London, United Kingdom. Our registered contact address for data protection purposes is:

  Howard Henry
  Project Sovereign
  London, United Kingdom
  mercecomventures@gmail.com

We are the data controller in respect of personal data processed through this platform.

2. WHAT DATA WE COLLECT

We collect and process the following categories of personal data:

  a) Account Data: name, email address, password hash, registration date, last login, user role.

  b) Professional Data: company name, job title, LinkedIn profile URL, telephone number, business address — provided voluntarily in deal contacts.

  c) Usage Data: pages visited, features used, session identifiers, timestamps, device type, browser user agent, referring URL, UTM campaign parameters.

  d) Communication Data: email thread content accessed via Gmail OAuth integration, call recordings or transcriptions where consent is given, SMS message content.

  e) M&A Deal Data: deal names, financial metrics (EBITDA, ARR, deal value), notes, stage progression, due diligence documents, AI-generated analysis.

  f) AI Interaction Data: prompts submitted to AI agents, responses generated, conversation history, token usage metrics.

  g) Technical Data: IP address, server logs, error logs, API call metadata.

3. LAWFUL BASIS FOR PROCESSING

We process your personal data under the following lawful bases (UK GDPR Article 6):

  — Contract (Art. 6(1)(b)): Processing necessary to provide the platform services you have subscribed to.
  — Legitimate Interests (Art. 6(1)(f)): Platform security, fraud prevention, product improvement, audit logging. We have conducted a Legitimate Interests Assessment (LIA) and concluded our interests do not override your rights.
  — Legal Obligation (Art. 6(1)(c)): AML/KYC checks, financial record retention under the Companies Act 2006.
  — Consent (Art. 6(1)(a)): Where you have explicitly opted in to marketing communications or additional tracking.

Special category data (Art. 9) is not deliberately collected. If inadvertently included in deal notes, it is processed under Art. 9(2)(a) explicit consent.

4. HOW WE USE YOUR DATA

  — To authenticate your identity and maintain your account.
  — To power AI agents that analyse M&A targets, draft communications, and score deals.
  — To retrieve and display your Gmail threads via the Gmail API (read/write access is used solely to display threads and send deal-related correspondence you explicitly authorise).
  — To send you platform alerts, notifications, and briefings via Twilio SMS/call.
  — To generate analytics on platform usage for product improvement.
  — To fulfil our AML and KYC obligations under the Proceeds of Crime Act 2002 and Money Laundering Regulations 2017.
  — To maintain an audit trail of all platform activities for compliance purposes.

5. DATA SHARING AND THIRD PARTIES

We share data with the following sub-processors:

  Vercel Inc. (USA) — static hosting. SCCs in place. Data: access logs.
  Supabase Inc. (USA) — database and authentication. SCCs + EU Standard Contractual Clauses in place. Data: all platform data stored in EU-West region.
  Anthropic PBC (USA) — AI inference (Claude). SCCs in place. Data: prompts and deal context submitted to AI agents. Anthropic does not train on API data.
  Tavily AI (USA) — web search. SCCs in place. Data: company names submitted for research queries.
  Twilio Inc. (USA) — SMS and voice. SCCs in place. Data: phone numbers, message bodies.
  Google LLC (USA/EEA) — Gmail API. Data: email threads accessed via your explicit OAuth consent. Google's standard DPA applies.

We do not sell personal data to third parties. We do not share data with advertisers.

6. INTERNATIONAL TRANSFERS

Where data is transferred outside the UK/EEA, we rely on:
  — UK International Data Transfer Agreements (IDTAs) or UK Addendum to EU SCCs.
  — Adequacy decisions where applicable.
  — Binding Corporate Rules where offered by the sub-processor.

7. DATA RETENTION

  Account data: retained for the duration of your subscription plus 6 years (Companies Act requirement).
  Deal and audit data: 7 years from deal close or abandonment (HMRC/FCA guidance).
  Analytics events: 24 months rolling.
  AI conversation history: 12 months rolling, then anonymised.
  AML/KYC records: 5 years from end of business relationship (MLR 2017 Reg. 40).
  Call recordings: 90 days unless flagged for compliance.

8. YOUR RIGHTS (UK GDPR)

You have the following rights:
  — Right of access (Art. 15): Request a copy of your personal data.
  — Right to rectification (Art. 16): Correct inaccurate data.
  — Right to erasure (Art. 17): Request deletion, subject to legal retention obligations.
  — Right to restriction (Art. 18): Pause processing in certain circumstances.
  — Right to data portability (Art. 20): Receive your data in a machine-readable format.
  — Right to object (Art. 21): Object to legitimate interests processing.
  — Rights related to automated decision-making (Art. 22): Our AI deal scoring involves automated analysis but no solely automated decisions with legal effect. Human review is always maintained.

To exercise any right, email: mercecomventures@gmail.com
We will respond within 30 days. No fee is charged for reasonable requests.

9. COOKIES AND TRACKING

See our Cookie Policy for full details. We use:
  — Session cookies (essential, no consent required).
  — Analytics cookies (consent required under PECR).
  — No third-party advertising cookies.

10. SECURITY

We implement appropriate technical and organisational measures including:
  — AES-256-GCM encryption for sensitive documents at rest.
  — TLS 1.3 for all data in transit.
  — Row Level Security (RLS) on all database tables.
  — JWT authentication with automatic refresh.
  — Regular penetration testing.
  — Access controls limiting data access to authorised personnel only.

11. CHILDREN

This platform is not directed at individuals under 18. We do not knowingly collect data from minors.

12. CHANGES TO THIS POLICY

We will notify you by email and in-platform notification at least 14 days before any material changes take effect.

13. COMPLAINTS

If you are dissatisfied with how we handle your data, you have the right to lodge a complaint with the Information Commissioner's Office (ICO):
  Website: ico.org.uk
  Telephone: 0303 123 1113
  Address: Wycliffe House, Water Lane, Wilmslow, Cheshire SK9 5AF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© 2026 Howard Henry / Project Sovereign. All rights reserved.`
},

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'terms_of_service',
  title: 'Terms of Service',
  version: '1.0',
  content: `TERMS OF SERVICE
Project Sovereign — Howard Henry, London
Effective Date: 20 March 2026 | Version 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PLEASE READ THESE TERMS CAREFULLY BEFORE USING PROJECT SOVEREIGN. BY ACCESSING OR USING THE PLATFORM, YOU AGREE TO BE BOUND BY THESE TERMS.

1. DEFINITIONS

"Platform" means the Project Sovereign web application, API, and all associated services.
"Operator" means Howard Henry, sole trader, London, UK (mercecomventures@gmail.com).
"User" means any individual who creates an account and accesses the Platform.
"Content" means any data, text, analysis, documents, or other material submitted to or generated by the Platform.
"AI Agents" means the automated AI systems powered by Anthropic's Claude models that perform analysis, drafting, and research tasks within the Platform.

2. ELIGIBILITY AND ACCOUNT REGISTRATION

2.1 You must be at least 18 years of age to use this Platform.
2.2 You must provide accurate, current, and complete registration information.
2.3 You are responsible for maintaining the confidentiality of your login credentials.
2.4 You must notify us immediately of any unauthorised access to your account at mercecomventures@gmail.com.
2.5 One account per individual unless expressly agreed in writing with the Operator.

3. LICENCE GRANT

Subject to these Terms, the Operator grants you a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform solely for your internal business purposes in connection with evaluating and executing mergers and acquisitions of UK SaaS businesses.

4. ACCEPTABLE USE

You agree NOT to:
  a) Use the Platform for any unlawful purpose or in violation of any applicable law or regulation.
  b) Attempt to reverse engineer, decompile, or extract source code from the Platform.
  c) Scrape, harvest, or systematically extract data from the Platform by automated means beyond normal API usage.
  d) Share your account credentials with any third party.
  e) Use the Platform to process data relating to individuals without appropriate lawful basis.
  f) Upload content that is defamatory, fraudulent, or infringes third-party intellectual property rights.
  g) Attempt to circumvent security controls, authentication mechanisms, or access data belonging to other users.
  h) Use the Platform to conduct market manipulation, insider dealing, or any activity that would constitute a financial crime under UK law.
  i) Introduce malware, viruses, or any malicious code.

5. AI AGENTS — IMPORTANT LIMITATIONS

5.1 The AI Agents within the Platform provide analysis, scoring, drafting assistance, and intelligence gathering as an aid to human decision-making. They do NOT constitute:
  — Financial advice regulated under the Financial Services and Markets Act 2000.
  — Legal advice.
  — Investment advice.
  — Audited financial information.

5.2 AI-generated content may contain errors, omissions, or hallucinations. You must independently verify all material facts before making any acquisition decision.

5.3 Deal scores, acquisition ratings, and risk assessments are indicative only and should not be relied upon as the sole basis for any transaction.

5.4 The Operator accepts no liability for losses arising from reliance on AI-generated analysis without independent verification.

6. DATA OWNERSHIP

6.1 You retain ownership of all data you input into the Platform ("Your Data").
6.2 You grant the Operator a limited, worldwide licence to process Your Data solely to provide the Platform services.
6.3 The Operator does not claim ownership of M&A deal data, contacts, or documents you create.
6.4 AI-generated outputs produced using Your Data as input are owned by you, subject to any applicable Anthropic usage policies.

7. INTELLECTUAL PROPERTY

The Platform, its design, software, AI architecture, and all Operator-created content are the intellectual property of Howard Henry. Nothing in these Terms transfers any IP rights to you except the limited licence in clause 3.

8. THIRD-PARTY INTEGRATIONS

The Platform integrates with third-party services including Google (Gmail), Anthropic, Tavily, Twilio, Vercel, and Supabase. Your use of those integrations is also subject to those providers' terms of service. The Operator is not responsible for third-party service interruptions.

9. PAYMENTS AND SUBSCRIPTION (IF APPLICABLE)

Where a paid tier is offered:
  9.1 Fees are invoiced in GBP and are exclusive of VAT where applicable.
  9.2 Subscriptions renew automatically unless cancelled with 30 days' notice.
  9.3 No refunds are provided for partial periods unless required by law.
  9.4 The Operator reserves the right to modify pricing with 30 days' written notice.

10. DISCLAIMERS AND LIMITATION OF LIABILITY

10.1 THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE". THE OPERATOR MAKES NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

10.2 TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE OPERATOR'S TOTAL LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER OR IN CONNECTION WITH THESE TERMS SHALL NOT EXCEED THE GREATER OF:
  (a) THE AMOUNTS PAID BY YOU TO THE OPERATOR IN THE 12 MONTHS PRECEDING THE CLAIM; OR
  (b) £500.

10.3 IN NO EVENT SHALL THE OPERATOR BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR DATA.

10.4 Nothing in these Terms excludes liability for death or personal injury caused by negligence, fraud, or any liability that cannot be excluded by law.

11. INDEMNIFICATION

You agree to indemnify, defend, and hold harmless the Operator from any claims, damages, losses, and expenses (including reasonable legal fees) arising from: (a) your use of the Platform in breach of these Terms; (b) Your Data infringing any third-party rights; or (c) your violation of any applicable law.

12. TERMINATION

12.1 You may terminate your account at any time by contacting mercecomventures@gmail.com.
12.2 The Operator may suspend or terminate your access immediately if you breach these Terms, engage in fraudulent activity, or upon 30 days' written notice for any other reason.
12.3 Upon termination, clauses 6, 7, 10, 11, 14, and 15 survive.
12.4 Your data will be retained for the periods set out in the Privacy Policy, then deleted or anonymised.

13. MODIFICATIONS

The Operator may modify these Terms at any time. You will be notified by email and in-platform notification at least 14 days before changes take effect. Continued use after the effective date constitutes acceptance.

14. GOVERNING LAW AND DISPUTE RESOLUTION

14.1 These Terms are governed by the laws of England and Wales.
14.2 The parties submit to the exclusive jurisdiction of the courts of England and Wales.
14.3 Before commencing formal proceedings, both parties agree to attempt to resolve any dispute through good-faith negotiation for at least 30 days.

15. GENERAL

15.1 Entire Agreement: These Terms, together with the Privacy Policy, Cookie Policy, and any signed DPA, constitute the entire agreement between you and the Operator.
15.2 Severability: If any provision is found unenforceable, the remaining provisions continue in full force.
15.3 Waiver: Failure to enforce any provision does not constitute a waiver.
15.4 Assignment: You may not assign your rights without the Operator's prior written consent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contact: Howard Henry | mercecomventures@gmail.com | London, UK
© 2026 Howard Henry / Project Sovereign. All rights reserved.`
},

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'cookie_policy',
  title: 'Cookie Policy',
  version: '1.0',
  content: `COOKIE POLICY
Project Sovereign — Howard Henry, London
Effective Date: 20 March 2026 | Version 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. WHAT ARE COOKIES?

Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work efficiently and to provide information to website operators. We also use similar technologies such as local storage, session storage, and tracking pixels.

2. OUR APPROACH

Project Sovereign is designed with privacy by default. We use only the minimum cookies necessary to operate the platform. We do not use third-party advertising cookies or cross-site tracking.

This Policy is issued in compliance with the Privacy and Electronic Communications Regulations 2003 (PECR) and UK GDPR.

3. COOKIES WE USE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORY 1 — STRICTLY NECESSARY (No consent required)

These cookies are essential for the Platform to function. They cannot be disabled.

  sb-access-token
  Purpose: Supabase authentication JWT token — keeps you logged in.
  Duration: Session / up to 1 hour (auto-refreshed).
  Provider: Supabase (supabase.co)

  sb-refresh-token
  Purpose: Used to silently renew the access token without re-login.
  Duration: Up to 7 days.
  Provider: Supabase (supabase.co)

  sb-[project]-auth-token
  Purpose: Primary session storage for Supabase Auth.
  Duration: Session.
  Provider: Supabase (supabase.co)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORY 2 — ANALYTICS (Consent required)

These cookies help us understand how the Platform is used so we can improve it.

  sv_session
  Purpose: Anonymous session identifier for analytics event grouping.
  Duration: 30 minutes (rolling).
  Provider: First-party (Project Sovereign).
  Data stored: Session ID, page views, feature interactions. No PII.

  sv_utm
  Purpose: Records UTM campaign parameters from your first visit to attribute traffic sources.
  Duration: 30 days.
  Provider: First-party (Project Sovereign).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORY 3 — LOCAL STORAGE (Functional)

We use browser local storage (not cookies) for certain functional data:

  sv_theme: Your UI theme preference (dark/light).
  sv_sidebar: Sidebar open/closed state.
  sv_last_page: Last visited page for navigation continuity.

This data remains on your device and is not transmitted to our servers.

4. HOW WE USE ANALYTICS DATA

Anonymous analytics data is used to:
  — Identify which features are most used and improve them.
  — Detect errors and performance bottlenecks.
  — Understand traffic sources to inform product decisions.

Analytics data is never sold or shared with third parties for advertising purposes.

5. MANAGING COOKIES

  Browser Settings: You can block or delete cookies through your browser settings. Note that blocking strictly necessary cookies will prevent the Platform from functioning.

  Opt-Out of Analytics: You can disable analytics cookies at any time from your account Settings → Privacy.

  Local Storage: You can clear local storage via your browser's developer tools (Settings → Application → Local Storage).

6. THIRD-PARTY COOKIES

We do not embed third-party analytics scripts (e.g., Google Analytics, Segment, Mixpanel). All analytics are first-party and privacy-preserving.

The following third-party services may set their own cookies when their integrations are active:

  Google (Gmail OAuth): If you connect your Google account, Google may set authentication cookies under their own Cookie Policy (policies.google.com/technologies/cookies).

7. CONSENT

On your first visit, you will be presented with a cookie consent banner. Strictly necessary cookies are placed immediately. Analytics cookies are only placed if you consent.

You may withdraw consent at any time from: Account → Settings → Cookie Preferences.

8. CHANGES TO THIS POLICY

We will update this Policy to reflect any changes to our cookie usage and will notify you of material changes via the platform.

9. CONTACT

For any questions about our use of cookies:
  mercecomventures@gmail.com
  Howard Henry, London, UK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© 2026 Howard Henry / Project Sovereign. All rights reserved.`
},

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'acceptable_use',
  title: 'Acceptable Use Policy',
  version: '1.0',
  content: `ACCEPTABLE USE POLICY
Project Sovereign — Howard Henry, London
Effective Date: 20 March 2026 | Version 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PURPOSE

This Acceptable Use Policy ("AUP") sets out the rules governing use of Project Sovereign ("the Platform"). It applies to all users and is incorporated by reference into the Terms of Service. Violation may result in immediate suspension or termination of access.

2. PERMITTED USE

The Platform is authorised for use solely in connection with:
  — Researching, evaluating, and executing acquisitions of UK-based SaaS businesses.
  — Managing M&A deal pipelines, due diligence processes, and post-acquisition integration.
  — Generating AI-assisted communications, analysis, and documentation related to the above.
  — Internal business operations of the registered user's firm or sole trader practice.

3. PROHIBITED CONDUCT

3.1 LEGAL VIOLATIONS
You must not use the Platform to:
  a) Violate any applicable UK law, regulation, or court order.
  b) Commit or facilitate market abuse, insider dealing, or market manipulation contrary to the Market Abuse Regulation (UK MAR).
  c) Breach the Proceeds of Crime Act 2002, Terrorism Act 2000, or Money Laundering Regulations 2017.
  d) Conduct regulated investment activities without FCA authorisation.
  e) Infringe any intellectual property right, trade secret, or confidentiality obligation.
  f) Process special category personal data without explicit consent and appropriate safeguards.
  g) Violate the Computer Misuse Act 1990.

3.2 PLATFORM ABUSE
You must not:
  a) Attempt to gain unauthorised access to other users' data, accounts, or any system or network.
  b) Conduct penetration testing or vulnerability scanning of the Platform without prior written authorisation.
  c) Introduce or transmit any virus, worm, trojan, ransomware, or other malicious code.
  d) Overload Platform infrastructure through denial-of-service attacks or excessive automated requests.
  e) Scrape or harvest data beyond your own account's data using automated means.
  f) Reverse engineer, decompile, disassemble, or attempt to derive source code from the Platform.
  g) Circumvent, disable, or interfere with security features.

3.3 AI AGENT MISUSE
You must not use AI Agents to:
  a) Generate content designed to deceive, defraud, or manipulate third parties.
  b) Produce content that constitutes regulated financial advice or legal advice intended to be relied upon by third parties.
  c) Harass, threaten, or stalk individuals.
  d) Generate false company intelligence reports intended to manipulate deal valuations dishonestly.
  e) Automate outreach in volume that constitutes spam under PECR or is in breach of email marketing regulations.
  f) Create synthetic identity documents or falsified KYC materials.

3.4 DATA MISUSE
You must not:
  a) Input into the Platform personal data about third parties without a lawful basis.
  b) Use the Platform to build profiles on individuals in ways that exceed the scope of legitimate M&A due diligence.
  c) Share Platform outputs (including AI-generated deal analyses) with parties not party to appropriate NDAs.
  d) Retain or further process data extracted from the Platform in violation of our Privacy Policy.

4. GMAIL INTEGRATION — SPECIFIC RESTRICTIONS

When using the Gmail integration:
  a) You may only connect your own Google account.
  b) The integration may only be used for deal-related correspondence.
  c) You must not use it to send unsolicited bulk communications.
  d) Automated sending must comply with PECR and CAN-SPAM equivalent UK standards.

5. COMPANY INTELLIGENCE — RESPONSIBLE USE

Company intelligence features (Tavily search, web scraping, social data) must be used for:
  — Genuine M&A due diligence and research.
  — Publicly available information only.

You must not use intelligence features to:
  — Compile profiles on private individuals beyond directors/founders in a professional capacity.
  — Engage in competitor surveillance unrelated to M&A activity.
  — Misrepresent the source or provenance of information to third parties.

6. REPORTING VIOLATIONS

If you become aware of misuse of the Platform, including by other users, please report it promptly to: mercecomventures@gmail.com

7. CONSEQUENCES OF VIOLATION

Violation of this AUP may result in:
  a) Immediate suspension of account access without notice.
  b) Permanent termination of account.
  c) Retention of relevant data to support legal proceedings.
  d) Referral to relevant authorities (including the FCA, ICO, or law enforcement) where violations involve potential criminal conduct.
  e) Civil action to recover losses caused by breach.

8. UPDATES

This AUP may be updated from time to time. We will notify you of material changes with 14 days' notice. Continued use constitutes acceptance.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contact: mercecomventures@gmail.com | Howard Henry, London, UK
© 2026 Howard Henry / Project Sovereign. All rights reserved.`
},

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'disclaimer',
  title: 'Disclaimer',
  version: '1.0',
  content: `DISCLAIMER
Project Sovereign — Howard Henry, London
Effective Date: 20 March 2026 | Version 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. GENERAL DISCLAIMER

Project Sovereign is an AI-assisted research and deal management tool. The information, analysis, scores, and outputs generated by or displayed within the Platform are provided for informational and operational purposes only. Nothing on this Platform constitutes:

  — Financial advice within the meaning of the Financial Services and Markets Act 2000.
  — Investment advice or a personal recommendation to buy, sell, or hold any security or business interest.
  — Legal advice or a solicitor-client relationship.
  — Accountancy or tax advice.
  — Audited financial information or a formal valuation.

2. AI-GENERATED CONTENT

The Platform employs large language model AI (Anthropic Claude) to generate deal analysis, company summaries, due diligence notes, draft communications, and acquisition scores. You acknowledge that:

  a) AI models can and do produce inaccurate, incomplete, or misleading outputs ("hallucinations").
  b) AI-generated acquisition scores, risk flags, and financial estimates are probabilistic indicators, not definitive assessments.
  c) No AI output should be relied upon as the sole basis for any investment or acquisition decision.
  d) AI models have knowledge cutoff dates and may not reflect the most current information about a company.

You are solely responsible for independently verifying all material facts before proceeding with any transaction.

3. COMPANY INTELLIGENCE AND RESEARCH

Intelligence data gathered via Tavily search, Jina Reader, and other web sources:

  a) Is sourced from publicly available information and may be incomplete, out of date, or inaccurate.
  b) Does not constitute a formal background check, credit check, or regulatory status check.
  c) Should be verified with primary sources including Companies House, the FCA Register, HMRC, and direct communication with the subject company.

4. NO REGULATED ACTIVITY

Howard Henry / Project Sovereign is not authorised or regulated by the Financial Conduct Authority (FCA). The Platform does not:

  — Arrange, advise on, or manage investments.
  — Provide credit or consumer finance.
  — Conduct regulated activities under the Financial Services and Markets Act 2000.

If you require regulated financial advice, you should consult an FCA-authorised firm.

5. ACCURACY OF INFORMATION

While we endeavour to keep the Platform operational and accurate, we make no warranty that:

  — The Platform will be uninterrupted, error-free, or free of viruses.
  — Company data retrieved from third-party sources is accurate, complete, or current.
  — AI outputs will meet your specific requirements or expectations.

6. THIRD-PARTY LINKS AND DATA

The Platform may display or retrieve information from third-party websites and data sources. We have no control over, and accept no responsibility for, the content, privacy practices, or accuracy of third-party sources.

7. MARKET AND TRANSACTION RISK

Mergers and acquisitions are inherently high-risk activities. Past deal performance is not indicative of future results. The Operator accepts no responsibility for:

  — Acquisition targets that underperform post-acquisition.
  — Deal failures arising from factors not identified by due diligence.
  — Changes in market conditions, interest rates, or regulatory environment affecting transaction value.

8. JURISDICTION

This disclaimer is governed by English law. The courts of England and Wales have exclusive jurisdiction over any disputes arising from it.

9. PROFESSIONAL ADVICE

Before proceeding with any significant acquisition, you should obtain independent advice from:
  — A qualified solicitor experienced in M&A law.
  — An FCA-authorised corporate finance adviser.
  — A qualified accountant or auditor.
  — Specialist advisers for tax, employment, IP, and regulatory matters.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© 2026 Howard Henry / Project Sovereign. All rights reserved.`
},

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'nda',
  title: 'Non-Disclosure Agreement Template',
  version: '1.0',
  content: `NON-DISCLOSURE AGREEMENT
Project Sovereign — Standard M&A NDA Template
Version 1.0 | Governed by the Laws of England and Wales

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠ TEMPLATE NOTICE: This is a standard template for informational purposes.
It should be reviewed and adapted by a qualified solicitor before use.
It does not constitute legal advice.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of [DATE] ("Effective Date")

BETWEEN:

[DISCLOSING PARTY NAME], a company incorporated in England and Wales with registered number [COMPANY NUMBER], whose registered office is at [ADDRESS] ("Disclosing Party");

AND

[RECEIVING PARTY NAME], [a company incorporated in England and Wales with registered number [COMPANY NUMBER] / an individual] of [ADDRESS] ("Receiving Party").

(Each a "Party" and collectively the "Parties")

BACKGROUND

The Parties wish to explore a potential transaction relating to the possible acquisition of the Disclosing Party's business or assets (the "Proposed Transaction"). In connection with this, the Disclosing Party is willing to disclose certain confidential and proprietary information to the Receiving Party, subject to the terms of this Agreement.

1. DEFINITIONS

1.1 "Confidential Information" means any and all information disclosed (whether in writing, orally, electronically, or by any other means) by the Disclosing Party to the Receiving Party in connection with the Proposed Transaction, including but not limited to:

  (a) Financial data, management accounts, projections, and forecasts;
  (b) Customer and supplier lists, contracts, and commercial terms;
  (c) Employee information, organisational structure, and remuneration details;
  (d) Technical specifications, source code, IP, trade secrets, and know-how;
  (e) Business plans, strategies, market analyses, and pricing;
  (f) The existence and terms of this Agreement;
  (g) The fact that discussions regarding the Proposed Transaction are taking place.

1.2 "Permitted Purpose" means the evaluation, negotiation, and execution of the Proposed Transaction only.

1.3 "Representatives" means directors, officers, employees, advisers (including legal counsel, accountants, and financial advisers), and agents of the Receiving Party who have a need to know the Confidential Information for the Permitted Purpose and are bound by obligations of confidentiality no less stringent than this Agreement.

2. EXCLUSIONS FROM CONFIDENTIAL INFORMATION

Information will not be Confidential Information to the extent that it:
  (a) Is or becomes publicly available through no fault of the Receiving Party;
  (b) Was already known to the Receiving Party before disclosure, as evidenced by written records;
  (c) Is independently developed by the Receiving Party without reference to the Confidential Information;
  (d) Is lawfully received from a third party without restriction on disclosure; or
  (e) Is required to be disclosed by law, court order, or regulatory authority — provided the Receiving Party gives the Disclosing Party maximum practicable prior written notice to seek a protective order.

3. OBLIGATIONS OF THE RECEIVING PARTY

3.1 The Receiving Party undertakes to:
  (a) Keep all Confidential Information strictly confidential;
  (b) Use Confidential Information solely for the Permitted Purpose;
  (c) Not disclose Confidential Information to any person other than its Representatives;
  (d) Ensure its Representatives are made aware of and comply with the obligations of this Agreement;
  (e) Apply at least the same degree of care to protect Confidential Information as it applies to its own confidential information, and in any event no less than reasonable care;
  (f) Promptly notify the Disclosing Party upon becoming aware of any actual or suspected unauthorised disclosure.

3.2 The Receiving Party shall not, without the prior written consent of the Disclosing Party:
  (a) Approach or solicit any customer, supplier, or employee of the Disclosing Party identified through the Confidential Information during the term of this Agreement and for 12 months thereafter;
  (b) Use Confidential Information for competitive intelligence purposes.

4. RETURN OR DESTRUCTION OF CONFIDENTIAL INFORMATION

4.1 Upon request by the Disclosing Party, or if the Proposed Transaction is not consummated within [12] months of the Effective Date, the Receiving Party shall promptly:
  (a) Return to the Disclosing Party all tangible materials containing Confidential Information; and
  (b) Permanently delete or destroy all electronic copies and confirm such destruction in writing.

4.2 The Receiving Party may retain one archival copy solely for compliance purposes, subject to continued confidentiality obligations.

5. TERM

This Agreement shall remain in force from the Effective Date for a period of [3] years, or until the Proposed Transaction is completed, whichever is later. Obligations with respect to trade secrets shall survive indefinitely.

6. NO LICENCE OR WARRANTY

6.1 Nothing in this Agreement grants the Receiving Party any licence, right, title, or interest in the Confidential Information beyond the Permitted Purpose.

6.2 The Disclosing Party makes no representation or warranty as to the accuracy, completeness, or fitness for purpose of the Confidential Information. All information is provided "as is".

7. NO OBLIGATION TO PROCEED

Nothing in this Agreement obligates either Party to proceed with the Proposed Transaction or to enter into any further agreement. Either Party may terminate discussions at any time.

8. REMEDIES

The Receiving Party acknowledges that breach of this Agreement may cause the Disclosing Party irreparable harm for which monetary damages would be an inadequate remedy. Accordingly, the Disclosing Party shall be entitled to seek injunctive or other equitable relief in addition to all other remedies available at law or in equity.

9. GENERAL

9.1 Entire Agreement: This Agreement constitutes the entire agreement between the Parties with respect to its subject matter and supersedes all prior discussions and agreements.

9.2 Governing Law: This Agreement is governed by the laws of England and Wales. The Parties submit to the exclusive jurisdiction of the courts of England and Wales.

9.3 Amendments: No amendment is binding unless made in writing and signed by both Parties.

9.4 Severability: If any provision is held unenforceable, the remaining provisions continue in effect.

9.5 No Waiver: Failure to enforce any provision shall not constitute a waiver.

9.6 Assignment: Neither Party may assign this Agreement without the prior written consent of the other Party.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNED as a DEED by the Parties:

DISCLOSING PARTY

Signed: ___________________________
Name:   ___________________________
Title:  ___________________________
Date:   ___________________________


RECEIVING PARTY

Signed: ___________________________
Name:   ___________________________
Title:  ___________________________
Date:   ___________________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© 2026 Howard Henry / Project Sovereign. Template only — seek legal advice before use.`
},

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'aml_policy',
  title: 'Anti-Money Laundering Policy',
  version: '1.0',
  content: `ANTI-MONEY LAUNDERING POLICY
Project Sovereign — Howard Henry, London
Effective Date: 20 March 2026 | Version 1.0
Compliance Framework: POCA 2002 | MLR 2017 | FATF Recommendations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. STATEMENT OF COMMITMENT

Project Sovereign ("Sovereign") is committed to full compliance with all applicable anti-money laundering ("AML") and counter-terrorist financing ("CTF") legislation. We maintain a zero-tolerance policy towards money laundering, terrorist financing, and financial crime in all its forms.

This Policy is issued pursuant to:
  — Proceeds of Crime Act 2002 (POCA 2002)
  — Terrorism Act 2000 (TA 2000)
  — Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 (MLR 2017, as amended)
  — Counter-Terrorism and Security Act 2015
  — FATF 40 Recommendations
  — JMLSG Guidance (HM Treasury approved)

2. SCOPE

This Policy applies to Howard Henry as operator of Project Sovereign and to all users of the Platform who facilitate, advise on, or participate in mergers and acquisitions transactions through it.

3. MONEY LAUNDERING REPORTING OFFICER (MLRO)

The nominated Money Laundering Reporting Officer ("MLRO") is:

  Howard Henry
  Project Sovereign
  London, United Kingdom
  mercecomventures@gmail.com

All internal suspicious activity reports ("SARs") must be submitted to the MLRO. The MLRO is responsible for evaluating SARs and submitting external reports to the National Crime Agency ("NCA") where appropriate.

4. RISK ASSESSMENT

4.1 Business Risk Assessment
M&A advisory activities carry elevated AML risk due to:
  — Large transaction values
  — Complexity of corporate structures
  — International counterparties
  — Use of holding companies and nominee structures
  — Potential for shell companies

4.2 Client Risk Factors
We assess risk against the following factors:

HIGH RISK indicators include:
  — Clients or targets in FATF high-risk or monitored jurisdictions
  — Politically Exposed Persons (PEPs) or their close associates/family members
  — Complex or opaque ownership structures with no clear UBO
  — Unusual transaction structures without clear commercial rationale
  — Cash-heavy businesses with limited audit trail
  — Reluctance to provide standard KYC documentation
  — Prior regulatory sanctions or adverse media
  — Transactions involving offshore jurisdictions known for financial secrecy

LOWER RISK indicators include:
  — UK-incorporated entities regulated by the FCA or other competent authority
  — Companies with clean Companies House records and standard ownership
  — Transactions with established UK financial institutions as counterparties

5. CUSTOMER DUE DILIGENCE (CDD)

5.1 Standard CDD
For all clients and material counterparties, we collect:
  a) For individuals: full name, date of birth, residential address, nationality, occupation, source of funds, source of wealth, government-issued photo ID, proof of address.
  b) For legal entities: registered name, registered number, registered address, directors and UBOs (≥25% ownership), corporate structure chart, certificate of incorporation, articles of association.

5.2 Ultimate Beneficial Owner (UBO) Verification
We identify and verify all UBOs holding ≥25% ownership or control. Where beneficial ownership cannot be verified, we escalate to Enhanced Due Diligence or decline the engagement.

5.3 Enhanced Due Diligence (EDD)
EDD is mandatory for:
  — High-risk jurisdictions (FATF list)
  — Politically Exposed Persons (PEPs) and related parties
  — Complex or unusual ownership structures
  — Transactions above £1,000,000 in value
  — Any case where standard CDD raises concerns

EDD measures include: senior management approval, enhanced source of funds/wealth verification, adverse media checks, PEP screening, ongoing monitoring, and more frequent review.

5.4 Simplified Due Diligence (SDD)
SDD may apply where the risk is demonstrably low (e.g., counterparty is an FCA-regulated firm on the Financial Services Register). SDD reduces the depth of verification but does not eliminate the obligation.

6. ONGOING MONITORING

We conduct ongoing monitoring of:
  — Transaction patterns for unusual activity
  — Changes in ownership or control of deal counterparties
  — Adverse media alerts on clients and targets
  — PEP and sanctions list screening at onboarding and periodically thereafter

AI-assisted monitoring within the Platform generates risk flags for human review. Flags do not constitute automatic rejection but trigger escalated human review.

7. SUSPICIOUS ACTIVITY REPORTING

7.1 All users who, in the course of using the Platform, know or suspect that a person is engaged in money laundering or terrorist financing must report this to the MLRO immediately via: mercecomventures@gmail.com

7.2 It is a criminal offence under POCA 2002 s.330 to fail to disclose knowledge or suspicion of money laundering in the regulated sector.

7.3 It is a criminal offence to "tip off" a subject of a SAR that a report has been made or is being considered (POCA 2002 s.333A).

7.4 The MLRO will assess each internal SAR and submit an external SAR to the NCA via the Suspicious Activity Reporting portal where there are reasonable grounds to suspect money laundering or terrorist financing.

7.5 Where a SAR is submitted, we will seek a consent decision from the NCA before proceeding with the relevant transaction.

8. RECORD KEEPING

We retain the following for a minimum of 5 years from the end of the business relationship (MLR 2017 Reg. 40):
  — CDD and EDD documentation
  — Transaction records
  — SAR submissions and MLRO decisions
  — Training records
  — Risk assessments

Records may be retained for longer where required by law or where proceedings are ongoing.

9. SANCTIONS SCREENING

We screen all clients, counterparties, and UBOs against:
  — HM Treasury Financial Sanctions List (OFSI)
  — UN Security Council Consolidated List
  — EU Consolidated Sanctions List (where applicable)
  — US OFAC SDN List (for US-connected transactions)

Screening is performed at onboarding and triggered by material changes. A match will result in immediate suspension of the engagement and reporting to OFSI where required.

10. TRAINING

All individuals using the Platform for regulated purposes confirm they have received AML training covering:
  — How to recognise money laundering and terrorist financing
  — Their personal obligations under POCA 2002 and MLR 2017
  — How to report suspicions to the MLRO
  — The consequences of tipping off

11. BREACH OF THIS POLICY

Breach of this Policy may constitute a criminal offence and will result in immediate suspension from the Platform and referral to appropriate authorities.

12. POLICY REVIEW

This Policy is reviewed annually and following any material legislative or regulatory change.

Next scheduled review: March 2027.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MLRO: Howard Henry | mercecomventures@gmail.com
© 2026 Howard Henry / Project Sovereign. All rights reserved.`
},

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'kyc_policy',
  title: 'Know Your Customer Policy',
  version: '1.0',
  content: `KNOW YOUR CUSTOMER (KYC) POLICY
Project Sovereign — Howard Henry, London
Effective Date: 20 March 2026 | Version 1.0
Framework: UK AML Regulations 2017 | FCA Guidance | JMLSG

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PURPOSE AND SCOPE

This Know Your Customer ("KYC") Policy establishes the procedures Project Sovereign follows to verify the identity of clients and material counterparties before and during engagement. It forms part of our overall AML/CTF compliance framework and implements the requirements of the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 (MLR 2017).

This Policy applies to all users conducting M&A transactions through the Platform and all target companies subject to acquisition due diligence.

2. KYC OBJECTIVES

Our KYC procedures are designed to:
  a) Confirm that clients and counterparties are who they claim to be.
  b) Understand the nature and purpose of the business relationship.
  c) Identify and verify the Ultimate Beneficial Owner(s) (UBOs).
  d) Detect and deter the use of our Platform for money laundering or fraud.
  e) Maintain records sufficient to satisfy regulatory obligations.

3. WHEN KYC IS REQUIRED

KYC checks are required:
  — Before entering into a business relationship with a new client.
  — Before executing or facilitating any transaction above £10,000 (or equivalent).
  — When there is a material change in ownership or control of a client entity.
  — When suspicion of money laundering or terrorist financing arises at any stage.
  — Periodically as part of ongoing monitoring (at least annually for high-risk relationships).

4. KYC REQUIREMENTS — INDIVIDUAL CLIENTS

4.1 Identity Verification
Collect and verify:
  — Full legal name
  — Date of birth
  — Current residential address
  — Nationality and country of birth

4.2 Acceptable Identity Documents (one from each category):
  Category A (Photo ID):
    — Valid passport
    — UK/EU/EEA national identity card
    — UK photocard driving licence
    — UK biometric residence permit

  Category B (Proof of Address — dated within 3 months):
    — Bank or building society statement
    — Utility bill (gas, electricity, water, landline telephone)
    — Council tax bill
    — HMRC correspondence
    — Electoral register confirmation

4.3 Source of Funds and Wealth
For transactions above £100,000 or where enhanced DD is triggered, we require:
  — Bank statements (3 months minimum)
  — Evidence of source of wealth (payslips, investment statements, property sale proceeds, inheritance documentation)
  — Business accounts where funds derive from a trading entity

5. KYC REQUIREMENTS — CORPORATE ENTITIES

5.1 Entity Verification
Collect and verify:
  — Full registered legal name
  — Company registration number
  — Registered office address
  — Country of incorporation
  — Nature of business

5.2 Corporate Documentation
  — Certificate of Incorporation (or equivalent)
  — Articles of Association / constitutional documents
  — Register of directors (current and complete)
  — Register of persons with significant control (PSC register) or equivalent
  — Latest filed accounts (or management accounts if recently incorporated)
  — Group structure chart showing all entities and ownership percentages

5.3 Ultimate Beneficial Owner (UBO) Identification
We identify all natural persons who:
  — Own directly or indirectly ≥25% of the shares or voting rights; or
  — Otherwise exercise control over the management of the entity.

Each UBO is subject to individual KYC checks as per Section 4. Where no natural person meets the 25% threshold, the senior managing official is verified as the UBO.

5.4 Overseas Entities
For companies incorporated outside the UK, we require equivalent documentation and may request a legal opinion from local counsel confirming the company's good standing and ownership structure.

6. POLITICALLY EXPOSED PERSONS (PEPs)

6.1 Definition
A PEP is an individual who is, or has been within the last 12 months, entrusted with a prominent public function, including:
  — Heads of state or government
  — Government ministers and senior officials
  — Members of parliament or senior judiciary
  — Senior military officers
  — Executives of state-owned enterprises
  — Senior officials of international organisations

6.2 PEP Obligations
Where a client, counterpart, or UBO is identified as a PEP or a close associate/family member of a PEP:
  — Automatic escalation to Enhanced Due Diligence
  — Senior management approval required before onboarding
  — Source of wealth must be verified to a high standard
  — Ongoing monitoring at enhanced frequency
  — Annual review of the relationship

7. SANCTIONS SCREENING

All individuals and entities subject to KYC are screened against sanctions lists at point of onboarding and when material changes occur. See the AML Policy for details of lists screened.

A partial or full sanctions match results in immediate suspension of the engagement and mandatory reporting to OFSI (HM Treasury Office of Financial Sanctions Implementation).

8. ELECTRONIC VERIFICATION

Where available and appropriate, we may use electronic verification services to cross-reference identity data against credit bureaus, electoral rolls, and commercial databases. Electronic verification supplements but does not replace documentary evidence for high-risk clients.

9. NON-FACE-TO-FACE ONBOARDING

As a digital platform, all client onboarding is non-face-to-face. We mitigate the elevated risk this presents by:
  — Requiring certified copies of identity documents where risk warrants it.
  — Conducting video verification calls for high-risk relationships.
  — Confirming first payment from a named account in the client's name at a regulated financial institution.

10. ONGOING MONITORING AND REVIEW

We maintain an ongoing obligation to monitor:
  — Changes in ownership, control, or PSC register of client entities.
  — Adverse media, regulatory sanctions, or legal proceedings involving clients.
  — Unusual transaction patterns inconsistent with the stated business purpose.
  — PEP status changes.

Reviews are triggered by: alerts from monitoring systems, material changes in the business relationship, or passage of time (high risk: 6 months; standard: 12 months; low risk: 24 months).

11. REFUSAL AND EXIT

We reserve the right to refuse to onboard a client, proceed with a transaction, or continue a relationship where:
  — Satisfactory KYC documentation cannot be obtained.
  — Beneficial ownership cannot be established.
  — Sanctions matches cannot be resolved.
  — Risk is assessed as unacceptably high.
  — A suspicious activity report has been filed and consent from the NCA is pending or refused.

12. RECORD RETENTION

KYC records are retained for a minimum of 5 years from the end of the business relationship, in accordance with MLR 2017 Regulation 40.

13. POLICY REVIEW

This Policy is reviewed annually. Next scheduled review: March 2027.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MLRO: Howard Henry | mercecomventures@gmail.com
© 2026 Howard Henry / Project Sovereign. All rights reserved.`
},

// ═══════════════════════════════════════════════════════════════════════════
{
  doc_type: 'data_processing_agreement',
  title: 'Data Processing Agreement',
  version: '1.0',
  content: `DATA PROCESSING AGREEMENT
Project Sovereign — Howard Henry, London
Effective Date: 20 March 2026 | Version 1.0
Pursuant to: UK GDPR Article 28 | Data Protection Act 2018

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This Data Processing Agreement ("DPA") is entered into between:

DATA CONTROLLER:
  [CONTROLLER NAME]
  [REGISTERED ADDRESS]
  [COMPANY NUMBER / ICO REGISTRATION]
  ("Controller")

DATA PROCESSOR:
  Howard Henry (operating as Project Sovereign)
  London, United Kingdom
  mercecomventures@gmail.com
  ("Processor")

(Each a "Party" and collectively the "Parties")

This DPA forms part of and is subject to the Terms of Service between the Controller and the Processor ("Main Agreement"). In the event of conflict, this DPA takes precedence with respect to data protection matters.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DEFINITIONS

"Applicable Data Protection Law" means the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, PECR, and any successor legislation.

"Data Subject" means an identified or identifiable natural person whose Personal Data is processed.

"Personal Data" has the meaning given in the UK GDPR, Article 4(1).

"Processing" has the meaning given in the UK GDPR, Article 4(2).

"Sub-processor" means any third party engaged by the Processor to process Personal Data on behalf of the Controller.

"Security Incident" means any confirmed breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, Personal Data.

2. SCOPE AND PURPOSE OF PROCESSING

The Processor shall process Personal Data only as necessary to provide the services described in the Main Agreement, specifically:
  — Storing and managing M&A deal data and contacts uploaded by the Controller.
  — Processing data through AI agents to generate analysis and drafts.
  — Facilitating communications via Gmail and Twilio integrations.
  — Maintaining audit logs of platform activities.

3. NATURE, PURPOSE, AND DURATION

Nature of Processing:     Collection, storage, retrieval, analysis, generation of derivatives, transmission, deletion.
Purpose of Processing:    M&A deal management, AI-assisted due diligence, communications, audit.
Duration of Processing:   For the term of the Main Agreement, plus any legally required retention period thereafter.

4. CATEGORIES OF DATA SUBJECTS AND DATA

Categories of Data Subjects:
  — Employees, directors, and shareholders of acquisition target companies.
  — The Controller's own staff and advisers using the Platform.

Categories of Personal Data:
  — Name, email, telephone, job title, LinkedIn profile.
  — Financial metrics and business data related to named individuals.
  — Email correspondence.
  — AI-generated analysis referencing named individuals.

Special Category Data: Not intended. The Processor shall promptly notify the Controller if special category data is inadvertently encountered.

5. OBLIGATIONS OF THE PROCESSOR

The Processor shall:

5.1 Process Personal Data only on documented instructions from the Controller, including with regard to international transfers, unless required to do so by applicable law. The Processor shall inform the Controller if it believes an instruction infringes applicable data protection law.

5.2 Ensure that persons authorised to process Personal Data have committed to confidentiality or are under a statutory obligation of confidentiality.

5.3 Implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including:
  (a) AES-256-GCM encryption for Personal Data stored at rest in the Vault.
  (b) TLS 1.3 for all Personal Data in transit.
  (c) Row Level Security (RLS) ensuring data segregation between Controller accounts.
  (d) Access controls and authentication (JWT with auto-refresh).
  (e) Regular penetration testing and security auditing.
  (f) Formal security incident response procedures.

5.4 Not engage Sub-processors without the Controller's prior written authorisation. The Controller hereby provides general authorisation for the Sub-processors listed in Schedule 1, subject to the Processor:
  (a) Imposing equivalent data protection obligations on each Sub-processor by contract.
  (b) Remaining liable to the Controller for Sub-processor compliance.
  (c) Informing the Controller of any intended changes to Sub-processors with at least 30 days' advance notice, giving the Controller the opportunity to object.

5.5 Assist the Controller in:
  (a) Responding to Data Subject rights requests (access, rectification, erasure, restriction, portability, objection) within timescales that allow the Controller to meet its own obligations.
  (b) Ensuring compliance with obligations under Articles 32–36 of the UK GDPR (security, DPIA, prior consultation).
  (c) Notifying the Controller of any Security Incident without undue delay and in any event within 72 hours of becoming aware, providing sufficient information for the Controller to meet its own notification obligations.

5.6 On expiry or termination of the Main Agreement, at the Controller's election:
  (a) Delete all Personal Data and provide written confirmation; or
  (b) Return all Personal Data to the Controller in a portable format (CSV/JSON).
  Unless applicable law requires continued storage, in which case the Processor will notify the Controller.

5.7 Make available to the Controller all information necessary to demonstrate compliance with this DPA and allow for audits conducted by the Controller or its appointed auditor, on reasonable notice (not less than 30 days except in an emergency). The Processor may object to an auditor who is a competitor.

6. INTERNATIONAL TRANSFERS

Where the Processor transfers Personal Data outside the UK, it shall ensure an appropriate transfer mechanism is in place (UK IDTA, UK Addendum to SCCs, or adequacy decision). The Sub-processors in Schedule 1 are located in the USA; transfers are covered by the UK-US Data Bridge (where applicable) or UK SCCs Addendum.

7. CONTROLLER'S OBLIGATIONS

The Controller warrants and represents that:
  (a) It has a lawful basis to process the Personal Data and to authorise the Processor to do so.
  (b) All Personal Data provided to the Processor has been collected in accordance with Applicable Data Protection Law.
  (c) It will provide the Processor with all instructions necessary to enable lawful processing.
  (d) It will promptly notify the Processor of any changes to applicable law that affect the processing.

8. LIABILITY

Each Party's liability under this DPA is subject to the limitations and exclusions set out in the Main Agreement, except to the extent that any limitation is prohibited by Applicable Data Protection Law.

9. DURATION AND TERMINATION

This DPA remains in force for the duration of the Main Agreement. On termination, Clause 5.6 (return or deletion) and Clause 5.7 (audit) survive for 12 months.

10. GOVERNING LAW

This DPA is governed by the laws of England and Wales. The Parties submit to the exclusive jurisdiction of the courts of England and Wales.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCHEDULE 1 — APPROVED SUB-PROCESSORS

  Vercel Inc. | USA | Static file hosting | Access logs only
  Supabase Inc. | USA (EU-West storage region) | Database, authentication, edge functions | All platform data
  Anthropic PBC | USA | AI inference (Claude models) | Prompts and deal context submitted to AI agents
  Tavily AI | USA | Web search | Company names submitted for research
  Twilio Inc. | USA | SMS and voice communications | Phone numbers, message bodies
  Google LLC | USA/EEA | Gmail API integration | Email threads (Controller-authorised access only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNATURES

CONTROLLER

Signed: ___________________________
Name:   ___________________________
Title:  ___________________________
Date:   ___________________________
On behalf of: ___________________________


PROCESSOR

Signed: ___________________________
Name:   Howard Henry
Title:  Operator, Project Sovereign
Date:   ___________________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© 2026 Howard Henry / Project Sovereign. All rights reserved.`
}

];

async function upsert(doc) {
  const res = await fetch(`${SB_URL}/rest/v1/legal_documents?doc_type=eq.${doc.doc_type}`, {
    method: 'PATCH',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ title: doc.title, content: doc.content, version: doc.version, is_current: true }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`✗ ${doc.doc_type}: ${res.status} ${t}`);
  } else {
    console.log(`✓ ${doc.doc_type}`);
  }
}

(async () => {
  console.log(`Seeding ${DOCS.length} legal documents...\n`);
  for (const doc of DOCS) await upsert(doc);
  console.log('\nDone.');
})();
