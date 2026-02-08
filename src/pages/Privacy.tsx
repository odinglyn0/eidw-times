import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Privacy = () => (
  <div className="min-h-screen flex flex-col items-center px-4 py-8">
    <div className="w-full max-w-3xl">
      <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
      </Link>
      <div className="prose dark:prose-invert max-w-none bg-white/80 dark:bg-gray-900/80 rounded-lg p-8 shadow-lg border-2 border-gray-300 dark:border-gray-600">
        <h1 className="text-center">PRIVACY POLICY</h1>
        <p className="text-center">eidwtimes.xyz</p>
        <p className="text-center"><em>Last Updated: February 8, 2026</em></p>

        <h2>1. INTRODUCTION</h2>
        <p>This Privacy Policy (hereinafter referred to as the &ldquo;Policy&rdquo;) describes how eidwtimes.xyz (hereinafter referred to as the &ldquo;Service&rdquo;, &ldquo;Website&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, processes, stores, discloses, and protects personal data and information provided by users (hereinafter referred to as &ldquo;you&rdquo;, &ldquo;your&rdquo;, or &ldquo;User&rdquo;) in connection with their access to and use of the Service.</p>
        <p>The Service is a personal project operated by an individual (contact: odin@odinglynn.com) and is not a commercial business entity. The Service provides real-time and machine learning-predicted security queue wait times for Dublin Airport, offered free of charge to Users.</p>
        <p>This Policy has been prepared in accordance with the General Data Protection Regulation (EU) 2016/679 (&ldquo;GDPR&rdquo;) and other applicable data protection legislation within the European Union and the European Economic Area.</p>
        <p>By accessing or using the Service, you acknowledge that you have read, understood, and agree to be bound by the terms of this Privacy Policy. If you do not agree with this Policy, you must immediately discontinue use of the Service.</p>

        <h2>2. DATA CONTROLLER</h2>
        <p>For the purposes of the GDPR and applicable data protection legislation, the data controller responsible for your personal data is:</p>
        <p><strong>eidwtimes.xyz</strong></p>
        <p><strong>Email: odin@odinglynn.com</strong></p>
        <p>All inquiries, requests, or concerns regarding the processing of your personal data should be directed to the above email address.</p>

        <h2>3. INFORMATION WE COLLECT</h2>
        <p>We collect and process the following categories of personal data and information:</p>
        <h3>3.1 Information You Provide Directly</h3>
        <p>When you interact with certain features of the Service, you may voluntarily provide us with personal data, including but not limited to:</p>
        <p>(a) Account Information: When creating a user account, we collect your email address and any other information you choose to provide during the registration process;</p>
        <p>(b) Email Subscription Data: When subscribing to email alerts or notifications, we collect your email address and subscription preferences;</p>
        <p>(c) Contact Form Submissions: When submitting inquiries or communications through contact forms, we collect your email address, name (if provided), and the content of your message;</p>
        <p>(d) Flight Tracking Preferences: When utilizing personalized flight tracking features, we collect flight numbers, departure times, and related preferences you choose to save.</p>
        <h3>3.2 Information Collected Automatically</h3>
        <p>When you access or use the Service, we automatically collect certain technical and usage information, including but not limited to:</p>
        <p>(a) Analytics Data: We collect basic analytics information including page views, traffic patterns, session duration, referral sources, and general usage statistics;</p>
        <p>(b) IP Addresses: We collect Internet Protocol (IP) addresses for security, fraud prevention, and analytics purposes;</p>
        <p>(c) Browser and Device Information: We collect information about the browser type, browser version, operating system, device type, screen resolution, and other technical characteristics of the device you use to access the Service;</p>
        <p>(d) Cookies and Similar Technologies: We use cookies and similar tracking technologies as detailed in Section 10 of this Policy.</p>

        <h2>4. LEGAL BASIS FOR PROCESSING</h2>
        <p>Under the GDPR, we process your personal data on the following legal bases:</p>
        <p>(a) Consent: Where you have provided explicit consent for specific processing activities, such as subscribing to email notifications or creating an account (GDPR Article 6(1)(a));</p>
        <p>(b) Contractual Necessity: Where processing is necessary for the performance of a contract with you or to take steps at your request prior to entering into a contract, such as providing the core functionality of the Service (GDPR Article 6(1)(b));</p>
        <p>(c) Legitimate Interests: Where processing is necessary for our legitimate interests, including operating and improving the Service, preventing fraud and abuse, ensuring security, conducting analytics, and communicating with users, provided such interests are not overridden by your fundamental rights and freedoms (GDPR Article 6(1)(f));</p>
        <p>(d) Legal Obligation: Where processing is necessary to comply with legal obligations to which we are subject (GDPR Article 6(1)(c)).</p>

        <h2>5. HOW WE USE YOUR INFORMATION</h2>
        <p>We use the collected information for the following purposes:</p>
        <p>(a) Service Provision: To provide, operate, maintain, and improve the core functionality of the Service, including delivering real-time and predicted security wait time information;</p>
        <p>(b) Personalization: To provide personalized features, including customized flight tracking, tailored notifications, and user-specific preferences;</p>
        <p>(c) Communications: To send email alerts, notifications, security updates, and responses to contact form submissions;</p>
        <p>(d) Machine Learning and Analytics: To improve the accuracy and reliability of our machine learning prediction models and to analyze usage patterns and trends;</p>
        <p>(e) Security and Fraud Prevention: To detect, prevent, and respond to fraud, abuse, security incidents, and other potentially harmful or illegal activities;</p>
        <p>(f) Legal Compliance: To comply with applicable laws, regulations, legal processes, and governmental requests;</p>
        <p>(g) Service Improvement: To understand how users interact with the Service, identify technical issues, and develop new features and enhancements.</p>

        <h2>6. DISCLOSURE OF INFORMATION</h2>
        <p>We do not sell, rent, or trade your personal data to third parties for their marketing purposes. We may disclose your information in the following limited circumstances:</p>
        <h3>6.1 Service Providers</h3>
        <p>We may share your information with third-party service providers who perform services on our behalf, including but not limited to:</p>
        <p>(a) Cloud Hosting Providers: Google Cloud, Vercel, and Supabase for infrastructure, hosting, and database services;</p>
        <p>(b) Authentication Services: Auth0 for user authentication and identity management;</p>
        <p>(c) Analytics Providers: Google Analytics and PostHog for usage analytics and performance monitoring;</p>
        <p>(d) Content Delivery and Security: Cloudflare for content delivery, DDoS protection, and security services.</p>
        <p>These service providers are contractually obligated to use your personal data only for the purposes of providing services to us and in accordance with this Privacy Policy and applicable data protection laws.</p>
        <h3>6.2 Legal Requirements</h3>
        <p>We may disclose your information if required to do so by law or in response to valid requests by public authorities, including to meet national security or law enforcement requirements. We may also disclose information when we believe in good faith that disclosure is necessary to:</p>
        <p>(a) Comply with a legal obligation, court order, or legal process;</p>
        <p>(b) Respond to lawful requests from law enforcement authorities;</p>
        <p>(c) Prevent or investigate potential fraud, abuse, security breaches, or other illegal activities;</p>
        <p>(d) Protect the rights, property, or safety of the Service, our users, or the public.</p>

        <h2>7. DATA RETENTION</h2>
        <p>We retain your personal data for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law.</p>
        <h3>7.1 Account Data</h3>
        <p>User account information, email subscription data, and flight tracking preferences are retained until you delete your account or request deletion of your data.</p>
        <h3>7.2 Analytics Data</h3>
        <p>Analytics data, including IP addresses, browser information, and usage statistics, may be retained indefinitely in aggregated or anonymized form for the purposes of improving the Service and developing machine learning models. Such anonymized data cannot be used to identify individual users.</p>
        <h3>7.3 Contact Form Submissions</h3>
        <p>Contact form submissions and related correspondence are retained for as long as necessary to respond to your inquiry and for a reasonable period thereafter for recordkeeping purposes.</p>

        <h2>8. DATA SECURITY</h2>
        <p>We implement appropriate technical and organizational security measures designed to protect your personal data against unauthorized access, alteration, disclosure, or destruction.</p>
        <h3>8.1 Encryption</h3>
        <p>All data transmitted between your device and our servers is encrypted in transit using industry-standard Transport Layer Security (TLS) protocols. Personal data stored in our systems is encrypted at rest using advanced encryption standards.</p>
        <h3>8.2 Access Controls</h3>
        <p>Access to personal data is restricted to the operator on a need-to-know basis. Service providers who process data on our behalf are subject to strict contractual obligations regarding data security and confidentiality.</p>
        <h3>8.3 Security Limitations</h3>
        <p>While we employ reasonable security measures, no method of transmission over the Internet or method of electronic storage is completely secure. We cannot guarantee absolute security of your personal data. You acknowledge and accept the inherent security risks of providing information and using services over the Internet.</p>

        <h2>9. INTERNATIONAL DATA TRANSFERS</h2>
        <p>Your personal data is stored and processed within the European Union and the European Economic Area (EU/EEA). We do not transfer your personal data outside the EU/EEA except where:</p>
        <p>(a) The transfer is to a country that has been deemed to provide an adequate level of protection for personal data by the European Commission;</p>
        <p>(b) Appropriate safeguards have been implemented, such as Standard Contractual Clauses approved by the European Commission;</p>
        <p>(c) The transfer is necessary for the performance of a contract between you and us or the implementation of pre-contractual measures taken at your request.</p>
        <p>Certain third-party service providers (such as Google Cloud, Vercel, Google Analytics, Auth0, and Cloudflare) may process data outside the EU/EEA. In such cases, we ensure that appropriate safeguards are in place to protect your personal data in accordance with GDPR requirements.</p>

        <h2>10. COOKIES AND TRACKING TECHNOLOGIES</h2>
        <p>We use cookies and similar tracking technologies to collect information about your browsing activities and to distinguish you from other users of the Service.</p>
        <h3>10.1 Types of Cookies We Use</h3>
        <p>(a) Essential Cookies: Strictly necessary cookies required for the operation of the Service, including authentication, security, and basic functionality;</p>
        <p>(b) Analytics Cookies: Cookies used to collect information about how visitors use the Service, including which pages are visited most often and if users receive error messages. This data is used to improve the Service and user experience;</p>
        <p>(c) Functional Cookies: Cookies that enable enhanced functionality and personalization, such as remembering your preferences, language settings, and flight tracking selections.</p>
        <h3>10.2 Third-Party Cookies</h3>
        <p>Third-party service providers, including Google Analytics, PostHog, Auth0, and Cloudflare, may set cookies on your device when you use the Service. These cookies are subject to the respective privacy policies of these third parties.</p>
        <h3>10.3 Managing Cookies</h3>
        <p>Most web browsers allow you to control cookies through browser settings. You can set your browser to refuse cookies or to alert you when cookies are being sent. However, if you disable or refuse cookies, some features of the Service may not function properly or may become inaccessible.</p>

        <h2>11. YOUR RIGHTS UNDER GDPR</h2>
        <p>Under the General Data Protection Regulation (GDPR), you have the following rights regarding your personal data:</p>
        <h3>11.1 Right of Access</h3>
        <p>You have the right to request confirmation of whether we are processing your personal data and, if so, to access that data and receive information about how it is processed (GDPR Article 15).</p>
        <h3>11.2 Right to Rectification</h3>
        <p>You have the right to request correction of inaccurate personal data and to have incomplete personal data completed (GDPR Article 16).</p>
        <h3>11.3 Right to Erasure (&ldquo;Right to be Forgotten&rdquo;)</h3>
        <p>You have the right to request deletion of your personal data in certain circumstances, including where the data is no longer necessary for the purposes for which it was collected, where you withdraw consent, or where you object to processing (GDPR Article 17).</p>
        <h3>11.4 Right to Data Portability</h3>
        <p>You have the right to receive your personal data in a structured, commonly used, and machine-readable format and to transmit that data to another controller (GDPR Article 20).</p>
        <h3>11.5 Right to Object</h3>
        <p>You have the right to object to processing of your personal data where such processing is based on legitimate interests, including objecting to profiling and direct marketing (GDPR Article 21).</p>
        <h3>11.6 Right to Restriction of Processing</h3>
        <p>You have the right to request restriction of processing of your personal data in certain circumstances (GDPR Article 18).</p>
        <h3>11.7 Right to Withdraw Consent</h3>
        <p>Where processing is based on consent, you have the right to withdraw that consent at any time. Withdrawal of consent does not affect the lawfulness of processing based on consent before its withdrawal (GDPR Article 7(3)).</p>
        <h3>11.8 Right to Lodge a Complaint</h3>
        <p>You have the right to lodge a complaint with a supervisory authority, in particular in the EU Member State of your habitual residence, place of work, or place of the alleged infringement (GDPR Article 77). In Ireland, the relevant supervisory authority is the Data Protection Commission (www.dataprotection.ie).</p>
        <h3>11.9 Exercising Your Rights</h3>
        <p>To exercise any of these rights, please contact us at odin@odinglynn.com. We will respond to your request within one month of receipt, though this period may be extended by two further months where necessary, taking into account the complexity and number of requests. We may request specific information from you to help us confirm your identity and ensure your right to access the data.</p>

        <h2>12. CHILDREN&rsquo;S PRIVACY</h2>
        <p>The Service does not impose age restrictions and may be accessed by individuals of any age. However, we do not knowingly collect or solicit personal data from children without appropriate parental or guardian consent where required by applicable law.</p>
        <p>If we become aware that we have collected personal data from a child without appropriate consent, we will take steps to delete that information as quickly as possible. If you believe that we might have information from or about a child, please contact us at odin@odinglynn.com.</p>

        <h2>13. CHANGES TO THIS PRIVACY POLICY</h2>
        <p>We reserve the right to modify, amend, or update this Privacy Policy at any time at our sole discretion. When we make changes to this Policy, we will update the &ldquo;Last Updated&rdquo; date at the top of this document.</p>
        <p>Material changes to this Privacy Policy will be communicated through prominent notice on the Service. Your continued use of the Service after any changes to this Privacy Policy constitutes your acceptance of such changes.</p>
        <p>We encourage you to review this Privacy Policy periodically to stay informed about how we are protecting your personal data.</p>

        <h2>14. THIRD-PARTY LINKS</h2>
        <p>The Service may contain links to third-party websites, services, or resources that are not owned or controlled by us. This Privacy Policy applies only to information collected by our Service.</p>
        <p>We are not responsible for the privacy practices of third-party websites. We encourage you to review the privacy policies of any third-party sites you visit. We do not endorse and are not responsible for the content, privacy policies, or practices of any third-party websites or services.</p>

        <h2>15. CONTACT INFORMATION</h2>
        <p>If you have any questions, concerns, comments, or requests regarding this Privacy Policy or our data processing practices, or if you wish to exercise any of your rights under the GDPR, please contact us at:</p>
        <p><strong>Email: odin@odinglynn.com</strong></p>
        <p>We will endeavor to respond to all legitimate requests within one month. Occasionally it may take us longer than one month if your request is particularly complex or you have made a number of requests, in which case we will notify you and keep you updated.</p>

        <h2>16. ACKNOWLEDGMENT</h2>
        <p>BY ACCESSING OR USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ THIS PRIVACY POLICY, UNDERSTAND IT, AND AGREE TO BE BOUND BY ITS TERMS. IF YOU DO NOT AGREE TO THIS PRIVACY POLICY, YOU MUST NOT ACCESS OR USE THE SERVICE.</p>
        <hr />
        <p className="text-center"><em>END OF PRIVACY POLICY</em></p>
      </div>
    </div>
  </div>
);

export default Privacy;
