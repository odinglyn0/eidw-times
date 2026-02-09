import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Terms = () => (
  <div className="min-h-screen flex flex-col items-center px-4 py-8">
    <div className="w-full max-w-3xl">
      <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
      </Link>
      <div className="prose dark:prose-invert max-w-none bg-white/80 dark:bg-gray-900/80 rounded-lg p-8 shadow-lg border-2 border-gray-300 dark:border-gray-600">
        <h1 className="text-center">TERMS OF SERVICE</h1>
        <p className="text-center">eidwtimes.xyz</p>
        <p className="text-center"><em>Last Updated: February 8, 2026</em></p>

        <h2>1. ACCEPTANCE OF TERMS</h2>
        <p>By accessing, browsing, or utilizing the website located at eidwtimes.xyz (hereinafter referred to as the &ldquo;Service&rdquo;, the &ldquo;Website&rdquo;, or the &ldquo;Platform&rdquo;), you (hereinafter referred to as &ldquo;User&rdquo;, &ldquo;you&rdquo;, or &ldquo;your&rdquo;) hereby acknowledge that you have read, understood, and agree to be bound by these Terms of Service (hereinafter referred to as the &ldquo;Terms&rdquo;, &ldquo;Agreement&rdquo;, or &ldquo;ToS&rdquo;) in their entirety, as well as any and all applicable laws, regulations, and ordinances governing the use of this Service.</p>
        <p>If you do not agree to these Terms in full and without reservation, you are expressly prohibited from accessing or using the Service and must discontinue use immediately.</p>

        <h2>2. DESCRIPTION OF SERVICE</h2>
        <p>The Service provides real-time and machine learning-predicted security queue wait times for Dublin Airport (hereinafter referred to as &ldquo;Predictions&rdquo; or &ldquo;Data&rdquo;). The Service is offered to Users free of charge and is operated as a personal project, not as a commercial business entity.</p>
        <p>The Service may include, but is not limited to, the following features (some of which may be designated as &ldquo;coming soon&rdquo; and are not guaranteed to be implemented): real-time security wait time displays, machine learning-based predictive analytics, contact forms, email subscription services, email alert notifications, personalized flight tracking with security updates, application programming interfaces (APIs) for data access, and user-initiated requests for machine learning predictions for specific times.</p>

        <h2>3. MODIFICATIONS TO TERMS</h2>
        <p>The operator of this Service reserves the unilateral right to modify, amend, supplement, or replace these Terms at any time, in whole or in part, at the operator&rsquo;s sole and absolute discretion, without prior notice to Users. Such modifications shall become effective immediately upon posting to the Website.</p>
        <p>Your continued access to or use of the Service following the posting of any changes to these Terms constitutes your binding acceptance of such changes. It is your sole responsibility to review these Terms periodically for updates. Failure to review does not constitute a waiver of your obligation to comply with the modified Terms.</p>

        <h2>4. INTELLECTUAL PROPERTY RIGHTS</h2>
        <h3>4.1 Service Content</h3>
        <p>All content, materials, information, data, software, source code, algorithms, machine learning models, text, graphics, logos, interfaces, and other intellectual property made available through the Service (collectively, &ldquo;Service Content&rdquo;) are and shall remain the exclusive property of the operator or its licensors and are protected by applicable copyright, trademark, patent, trade secret, and other intellectual property laws and treaties.</p>
        <h3>4.2 User Data</h3>
        <p>Users retain all rights, title, and interest in and to any data, information, or content that they submit, upload, or transmit to the Service (&ldquo;User Data&rdquo;). By submitting User Data, you grant the operator a non-exclusive, worldwide, royalty-free license to use, process, and store such User Data solely for the purposes of operating, maintaining, and improving the Service.</p>
        <h3>4.3 Restrictions</h3>
        <p>Users are expressly prohibited from reproducing, distributing, modifying, creating derivative works of, publicly displaying, publicly performing, republishing, downloading, storing, or transmitting any Service Content except as expressly permitted herein or through the designated API infrastructure when made available.</p>

        <h2>5. ACCEPTABLE USE POLICY</h2>
        <h3>5.1 Permitted Use</h3>
        <p>The Service is provided exclusively for personal, non-commercial use. Users may access and utilize the Service solely for the purpose of obtaining security wait time information for their individual travel planning needs.</p>
        <h3>5.2 Prohibited Activities</h3>
        <p>Users shall not, and shall not permit any third party to:</p>
        <p>(a) Use the Service for any commercial purpose whatsoever, including but not limited to resale, redistribution, incorporation into commercial products, or monetization of any kind;</p>
        <p>(b) Access, retrieve, scrape, crawl, or extract data from the Service through automated means, including but not limited to bots, spiders, scrapers, browser automation tools, headless browsers, or any other automated data collection methodologies, except through the officially designated application programming interfaces (APIs) when such APIs are made available;</p>
        <p>(c) Utilize browser-based scraping, browser automation, or any form of programmatic access to the user-facing website interface for the purpose of data extraction;</p>
        <p>(d) Circumvent, disable, or otherwise interfere with security-related features of the Service or features that prevent or restrict use or copying of any content;</p>
        <p>(e) Engage in any activity that could damage, disable, overburden, or impair the Service or interfere with any other party&rsquo;s use and enjoyment of the Service;</p>
        <p>(f) Attempt to gain unauthorized access to any portion of the Service, other accounts, computer systems, or networks connected to the Service through hacking, password mining, or any other means;</p>
        <p>(g) Use the Service to transmit any viruses, worms, defects, Trojan horses, malware, or any items of a destructive nature;</p>
        <p>(h) Engage in any form of spam, unsolicited advertising, or bulk messaging through or in connection with the Service;</p>
        <p>(i) Violate any applicable local, state, national, or international law or regulation;</p>
        <p>(j) Impersonate or attempt to impersonate the operator, another user, or any other person or entity;</p>
        <p>(k) Engage in any other conduct that restricts or inhibits anyone&rsquo;s use or enjoyment of the Service, or which, as determined by the operator, may harm the operator or users of the Service or expose them to liability.</p>
        <h3>5.3 API Usage</h3>
        <p>When application programming interfaces are made available, all data access must be conducted exclusively through such officially designated APIs. The APIs shall be provided free of charge. Any attempt to access data through means other than the designated APIs, including but not limited to browser scraping or reverse engineering, constitutes a material breach of these Terms.</p>

        <h2>6. DISCLAIMERS AND WARRANTIES</h2>
        <h3>6.1 &ldquo;AS IS&rdquo; Basis</h3>
        <p>THE SERVICE, INCLUDING ALL CONTENT, PREDICTIONS, DATA, FUNCTIONS, MATERIALS, AND INFORMATION MADE AVAILABLE ON OR ACCESSED THROUGH THE SERVICE, IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.</p>
        <h3>6.2 No Warranties</h3>
        <p>TO THE FULLEST EXTENT PERMISSIBLE PURSUANT TO APPLICABLE LAW, THE OPERATOR DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, COMPLETENESS, TIMELINESS, RELIABILITY, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING OR USAGE OF TRADE.</p>
        <h3>6.3 Prediction Accuracy</h3>
        <p>The operator makes no representations or warranties regarding the accuracy, reliability, completeness, currentness, or timeliness of any Predictions or Data provided through the Service. While best efforts are employed to provide accurate and useful information, the operator does not guarantee that Predictions will be accurate, complete, or useful for any particular purpose.</p>
        <p>Machine learning predictions are inherently probabilistic and subject to errors, inaccuracies, and variability. Actual security wait times may differ materially from predicted times due to factors including but not limited to sudden changes in passenger volume, security incidents, operational disruptions, technical failures, or other unforeseen circumstances.</p>
        <h3>6.4 Service Availability</h3>
        <p>The operator does not warrant that the Service will be uninterrupted, timely, secure, or error-free, or that defects will be corrected. The operator does not warrant that the Service or the server that makes it available are free of viruses or other harmful components.</p>

        <h2>7. LIMITATION OF LIABILITY</h2>
        <h3>7.1 Exclusion of Damages</h3>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE OPERATOR BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, LOSS OF DATA, LOSS OF USE, LOSS OF GOODWILL, MISSED FLIGHTS, TRAVEL DISRUPTIONS, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:</p>
        <p>(a) Your access to, use of, or inability to access or use the Service;</p>
        <p>(b) Any conduct or content of any third party on or through the Service;</p>
        <p>(c) Any content obtained from the Service;</p>
        <p>(d) Unauthorized access, use, or alteration of your transmissions or content;</p>
        <p>(e) Inaccurate, incomplete, or outdated Predictions or Data;</p>
        <p>(f) Reliance on any Predictions or Data provided through the Service.</p>
        <h3>7.2 Cap on Liability</h3>
        <p>NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED HEREIN, THE OPERATOR&rsquo;S LIABILITY TO YOU FOR ANY CAUSE WHATSOEVER AND REGARDLESS OF THE FORM OF THE ACTION, WILL AT ALL TIMES BE LIMITED TO THE AMOUNT PAID, IF ANY, BY YOU TO THE OPERATOR FOR THE SERVICE. GIVEN THAT THE SERVICE IS PROVIDED FREE OF CHARGE, THE OPERATOR&rsquo;S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED ZERO EUROS (&euro;0.00).</p>
        <h3>7.3 User Responsibility</h3>
        <p>YOU EXPRESSLY ACKNOWLEDGE AND AGREE THAT YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK. YOU ARE SOLELY RESPONSIBLE FOR MAKING YOUR OWN INDEPENDENT DECISIONS REGARDING TRAVEL TIMING, AIRPORT ARRIVAL, AND ALL RELATED TRAVEL ARRANGEMENTS. THE SERVICE IS INTENDED AS AN INFORMATIONAL TOOL ONLY AND SHOULD NOT BE RELIED UPON AS THE SOLE BASIS FOR MAKING TRAVEL DECISIONS.</p>

        <h2>8. INDEMNIFICATION</h2>
        <h3>8.1 User Indemnification</h3>
        <p>You agree to defend, indemnify, and hold harmless the operator, and any affiliates, contractors, licensors, and service providers, and their respective directors, officers, employees, agents, and representatives (collectively, the &ldquo;Indemnified Parties&rdquo;) from and against any and all claims, damages, obligations, losses, liabilities, costs, debts, and expenses (including but not limited to attorney&rsquo;s fees and legal costs) arising from:</p>
        <p>(a) Your use of and access to the Service;</p>
        <p>(b) Your violation of any term of these Terms;</p>
        <p>(c) Your violation of any third-party right, including without limitation any copyright, trademark, trade secret, or other proprietary or privacy right;</p>
        <p>(d) Any claim that your User Data caused damage to a third party;</p>
        <p>(e) Your violation of any applicable laws, rules, or regulations.</p>
        <h3>8.2 Operator Indemnification</h3>
        <p>The operator agrees to defend, indemnify, and hold harmless Users from and against any and all claims, damages, obligations, losses, liabilities, costs, debts, and expenses (including but not limited to attorney&rsquo;s fees and legal costs) arising from the operator&rsquo;s gross negligence, willful misconduct, or material breach of these Terms, except to the extent such claims arise from User&rsquo;s breach of these Terms or misuse of the Service.</p>

        <h2>9. THIRD-PARTY CONTENT AND SERVICES</h2>
        <p>The Service may contain links to third-party websites, services, or resources (&ldquo;Third-Party Services&rdquo;) and may utilize data obtained from third-party sources (&ldquo;Third-Party Data&rdquo;). Such Third-Party Services and Third-Party Data are not under the control of the operator.</p>
        <p>The operator is not responsible for and does not endorse the content, accuracy, reliability, opinions, or policies of any Third-Party Services or Third-Party Data. Your use of Third-Party Services is at your own risk and subject to the terms and conditions of such third parties. The operator shall not be liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection with use of or reliance on any such Third-Party Services or Third-Party Data.</p>

        <h2>10. TERMINATION AND SUSPENSION</h2>
        <h3>10.1 Termination by Operator</h3>
        <p>The operator reserves the right, in its sole discretion, to terminate, suspend, or restrict your access to the Service, in whole or in part, immediately and without prior notice, for any reason or no reason, including but not limited to:</p>
        <p>(a) Violation of these Terms;</p>
        <p>(b) Engaging in prohibited activities as set forth in Section 5;</p>
        <p>(c) Suspicious, fraudulent, or illegal activity;</p>
        <p>(d) Technical or security concerns;</p>
        <p>(e) Discontinuation of the Service in its entirety.</p>
        <h3>10.2 Effect of Termination</h3>
        <p>Upon termination of your access to the Service, your right to use the Service will immediately cease. All provisions of these Terms which by their nature should survive termination shall survive termination, including but not limited to ownership provisions, warranty disclaimers, indemnification obligations, and limitations of liability.</p>
        <h3>10.3 Service Discontinuation</h3>
        <p>The operator reserves the absolute right to discontinue, suspend, or terminate the Service at any time, temporarily or permanently, without prior notice to Users and without any liability whatsoever. The operator makes no commitment regarding the continued availability or operation of the Service.</p>

        <h2>11. DISPUTE RESOLUTION AND GOVERNING LAW</h2>
        <h3>11.1 Governing Law</h3>
        <p>These Terms shall be governed by and construed in accordance with the laws of Ireland and the European Union, without regard to conflict of law principles that would require the application of the laws of another jurisdiction.</p>
        <h3>11.2 Jurisdiction</h3>
        <p>You agree that any legal action or proceeding arising out of or relating to these Terms or your use of the Service shall be instituted exclusively in the courts of Ireland. You irrevocably submit to the exclusive jurisdiction of such courts and waive any objection to venue or inconvenient forum.</p>
        <h3>11.3 Informal Dispute Resolution</h3>
        <p>Prior to initiating any formal legal proceedings, the parties agree to attempt in good faith to resolve any dispute, claim, or controversy arising out of or relating to these Terms or the Service through informal negotiation. Either party may initiate informal dispute resolution by providing written notice to the other party via email, describing the nature of the dispute and proposing a resolution.</p>
        <p>The parties shall engage in good faith negotiations for a period of thirty (30) days from the date of such notice. If the dispute cannot be resolved through informal negotiation within such period, either party may pursue resolution through the courts as specified in Section 11.2.</p>

        <h2>12. GENERAL PROVISIONS</h2>
        <h3>12.1 Severability</h3>
        <p>If any provision of these Terms is found by a court of competent jurisdiction to be invalid, illegal, or unenforceable, the validity, legality, and enforceability of the remaining provisions shall not in any way be affected or impaired thereby. Such invalid, illegal, or unenforceable provision shall be deemed modified to the minimum extent necessary to make it valid, legal, and enforceable while preserving its intent, or if such modification is not possible, such provision shall be severed from these Terms.</p>
        <h3>12.2 Waiver</h3>
        <p>No waiver by the operator of any term or condition set forth in these Terms shall be deemed a further or continuing waiver of such term or condition or a waiver of any other term or condition. Any failure of the operator to assert a right or provision under these Terms shall not constitute a waiver of such right or provision.</p>
        <h3>12.3 Entire Agreement</h3>
        <p>These Terms, together with any Privacy Policy or other legal notices published by the operator on the Service, constitute the sole and entire agreement between you and the operator with respect to the Service and supersede all prior and contemporaneous understandings, agreements, representations, and warranties, both written and oral, with respect to the Service.</p>
        <h3>12.4 Force Majeure</h3>
        <p>The operator shall not be liable for any failure to perform its obligations hereunder where such failure results from any cause beyond the operator&rsquo;s reasonable control, including but not limited to acts of God, war, terrorism, riots, embargoes, acts of civil or military authorities, fire, floods, earthquakes, accidents, pandemics, epidemics, strikes, shortages of transportation facilities, fuel, energy, labor, or materials, or failures of telecommunications or information services infrastructure.</p>
        <h3>12.5 Assignment</h3>
        <p>You may not assign, transfer, or delegate any of your rights or obligations under these Terms without the prior written consent of the operator. Any purported assignment in violation of this Section shall be null and void. The operator may freely assign, transfer, or delegate its rights and obligations under these Terms without restriction.</p>
        <h3>12.6 No Agency</h3>
        <p>No agency, partnership, joint venture, employment, or franchise relationship is intended or created by these Terms. Neither party has any authority to bind the other or to incur any obligation on behalf of the other.</p>

        <h2>13. CONTACT INFORMATION</h2>
        <p>For any questions, concerns, or notices regarding these Terms or the Service, please contact the operator via email at:</p>
        <p><strong>eidwtimes@proton.me</strong></p>
        <p>All legal notices, requests, or other formal communications required or permitted under these Terms must be delivered via email to the above address. Notices shall be deemed given upon receipt of electronic confirmation of delivery.</p>

        <h2>14. ACKNOWLEDGMENT</h2>
        <p>BY ACCESSING OR USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ THESE TERMS OF SERVICE, UNDERSTAND THEM, AND AGREE TO BE BOUND BY THEM. IF YOU DO NOT AGREE TO THESE TERMS, YOU MUST NOT ACCESS OR USE THE SERVICE.</p>
        <hr />
        <p className="text-center"><em>END OF TERMS OF SERVICE</em></p>
      </div>
    </div>
  </div>
);

export default Terms;
