import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const CookiePolicy = () => (
  <div className="min-h-screen flex flex-col items-center px-4 py-8">
    <div className="w-full max-w-3xl">
      <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
      </Link>
      <div className="prose dark:prose-invert max-w-none bg-white/80 dark:bg-gray-900/80 rounded-lg p-8 shadow-lg border-2 border-gray-300 dark:border-gray-600">
        <h1 className="text-center">COOKIE POLICY</h1>
        <p className="text-center">eidwtimes.xyz</p>
        <p className="text-center"><em>Last Updated: February 8, 2026</em></p>

        <h2>1. INTRODUCTION</h2>
        <p>This Cookie Policy (hereinafter referred to as the &ldquo;Policy&rdquo;) explains how eidwtimes.xyz (hereinafter referred to as the &ldquo;Service&rdquo;, &ldquo;Website&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) uses cookies and similar tracking technologies when you access or use our Service.</p>
        <p>This Policy should be read in conjunction with our Privacy Policy and Terms of Service. By continuing to browse or use the Service, you acknowledge that you have read and understood this Cookie Policy and consent to our use of cookies and similar technologies as described herein.</p>

        <h2>2. WHAT ARE COOKIES</h2>
        <p>Cookies are small text files that are placed on your computer, mobile device, or other electronic device (collectively, &ldquo;Device&rdquo;) when you visit a website. Cookies contain information that is transferred to your Device&rsquo;s hard drive and allow the website to recognize your Device and store certain information about your preferences, actions, or other data.</p>
        <p>Cookies serve various functions, including enabling certain features to function properly, enhancing user experience, providing analytics and performance data, and delivering personalized content. Some cookies are essential for the basic functioning of a website, while others are used for additional purposes such as analytics and advertising.</p>

        <h2>3. TYPES OF COOKIES WE USE</h2>
        <p>We use both first-party cookies (set directly by us) and third-party cookies (set by third-party service providers). We use both session cookies (which expire when you close your browser) and persistent cookies (which remain on your Device until they expire or you delete them).</p>
        <p>The cookies we use fall into the following categories:</p>
        <h3>3.1 Strictly Necessary Cookies</h3>
        <p>These cookies are essential for the operation of the Service and enable core functionality such as security, network management, authentication, and accessibility. Without these cookies, certain features and services you have requested cannot be provided. These cookies are strictly necessary and do not require your consent under applicable law.</p>
        <p><strong>Purpose:</strong> Authentication and login state management; maintaining user session security; remembering user preferences and settings critical to Service functionality.</p>
        <p><strong>Examples:</strong> Session tokens, authentication identifiers, security tokens.</p>
        <h3>3.2 Functional Cookies</h3>
        <p>These cookies enable enhanced functionality and personalization. They may be set by us or by third-party providers whose services we have added to our Service. If you do not allow these cookies, some or all of these features may not function properly.</p>
        <p><strong>Purpose:</strong> Remembering theme and display preferences; storing notification preferences; saving flight tracking preferences; maintaining language settings; enabling personalized features.</p>
        <p><strong>Examples:</strong> User preference cookies, customization settings, interface configuration.</p>
        <h3>3.3 Analytics and Performance Cookies</h3>
        <p>These cookies collect information about how visitors use the Service, including which pages are visited most frequently, how users navigate through the Service, and whether users encounter errors. All information collected by these cookies is aggregated and therefore anonymous. The data is used solely to improve the functionality, performance, and user experience of the Service.</p>
        <p><strong>Purpose:</strong> Collecting statistics on page views and traffic patterns; understanding user behavior and interactions; identifying technical issues and errors; measuring Service performance; improving machine learning prediction models.</p>
        <p><strong>Third-Party Providers:</strong> Google Analytics, PostHog.</p>
        <p><strong>Examples:</strong> Google Analytics cookies (_ga, _gid, _gat), PostHog analytics cookies, performance monitoring cookies.</p>

        <h2>4. THIRD-PARTY COOKIES</h2>
        <p>In addition to our own cookies, we use various third-party service providers who set cookies on your Device to provide specific functionality and services. These third-party cookies are subject to the respective privacy policies and cookie policies of the third-party service providers.</p>
        <p>The following third-party service providers may set cookies when you use our Service:</p>
        <p><strong>Google Analytics:</strong> Provides web analytics services to help us understand how users interact with the Service. Google Analytics uses cookies including _ga, _gid, and _gat to collect anonymized information about your usage patterns.</p>
        <p><strong>PostHog:</strong> Provides product analytics and feature tracking services. PostHog uses cookies to track user behavior and product usage metrics.</p>
        <p><strong>Auth0:</strong> Provides authentication and identity management services. Auth0 uses cookies to manage authentication sessions and security tokens.</p>
        <p><strong>Cloudflare:</strong> Provides content delivery network (CDN), DDoS protection, and security services. Cloudflare uses cookies for security purposes, load balancing, and performance optimization.</p>
        <p><strong>Ketch:</strong> Provides consent management and privacy compliance services. Ketch uses cookies to store and manage your cookie consent preferences.</p>
        <p><strong>Vercel:</strong> Provides hosting and deployment infrastructure services. Vercel may use cookies for performance optimization and analytics.</p>
        <p>For more information about how these third parties use cookies, please refer to their respective privacy policies and cookie policies.</p>

        <h2>5. COOKIE DURATION</h2>
        <p>Cookies may be either session cookies or persistent cookies, and their duration varies depending on their purpose and type:</p>
        <p><strong>Session Cookies:</strong> These cookies are temporary and are deleted automatically when you close your browser. They are primarily used for authentication and maintaining session state during your visit to the Service.</p>
        <p><strong>Persistent Cookies:</strong> These cookies remain on your Device after you close your browser and are activated each time you visit the Service. The duration of persistent cookies varies based on their specific purpose:</p>
        <p>- Strictly Necessary and Functional Cookies: Typically expire after 30 days to 1 year, depending on the specific functionality they support;</p>
        <p>- Analytics Cookies: Google Analytics cookies typically expire after 2 years (_ga) or 24 hours (_gid). PostHog cookies may persist for up to 1 year;</p>
        <p>- Third-Party Service Cookies: Duration varies by provider and specific cookie. Refer to the respective third-party privacy policies for detailed information.</p>

        <h2>6. OTHER TRACKING TECHNOLOGIES</h2>
        <p>In addition to cookies, we may use other similar tracking and storage technologies:</p>
        <h3>6.1 Local Storage</h3>
        <p>Local Storage is a web browser feature that allows websites to store data persistently on your Device. Unlike cookies, data stored in Local Storage does not expire automatically and remains until explicitly deleted by the user or the website.</p>
        <p><strong>Purpose:</strong> We use Local Storage to store user preferences, application state, cached data for improved performance, and configuration settings that enhance your user experience.</p>
        <h3>6.2 Session Storage</h3>
        <p>Session Storage is similar to Local Storage but is designed to store data only for the duration of a single browsing session. Data stored in Session Storage is automatically cleared when you close your browser tab or window.</p>
        <p><strong>Purpose:</strong> We use Session Storage to maintain temporary state information, store data needed only during a single session, and manage transient user interactions.</p>
        <h3>6.3 Web Beacons and Pixels</h3>
        <p>Web beacons (also known as pixel tags or clear GIFs) are tiny graphics with a unique identifier, embedded invisibly on web pages or in emails, that allow tracking of user behavior and interactions. These technologies may be used in conjunction with cookies to collect information about your use of the Service.</p>

        <h2>7. COOKIE CONSENT AND MANAGEMENT</h2>
        <h3>7.1 Consent Mechanism</h3>
        <p>Upon your first visit to the Service, you will be presented with a cookie consent banner powered by Ketch, our consent management platform. This banner provides you with the following options:</p>
        <p>(a) Accept All Cookies: By selecting this option, you consent to the use of all cookies, including strictly necessary, functional, and analytics cookies;</p>
        <p>(b) Reject Non-Essential Cookies: By selecting this option, you consent only to strictly necessary cookies. Functional and analytics cookies will be disabled;</p>
        <p>(c) Manage Cookie Preferences: By selecting this option, you can access granular cookie controls where you may enable or disable specific categories of cookies according to your preferences.</p>
        <p>Your cookie preferences are stored and respected across your visits to the Service. You may change your cookie preferences at any time by accessing the cookie settings available through the Service interface or by clicking the cookie preferences link typically located in the footer of our website.</p>
        <p>Please note that strictly necessary cookies do not require your consent under applicable law and will be set regardless of your cookie preference selections, as they are essential for the basic operation of the Service.</p>
        <h3>7.2 Managing Cookies Through Your Browser</h3>
        <p>You can control and manage cookies through your web browser settings. Most browsers allow you to:</p>
        <p>(a) View and delete cookies currently stored on your Device;</p>
        <p>(b) Block third-party cookies;</p>
        <p>(c) Block cookies from specific websites;</p>
        <p>(d) Block all cookies from being set;</p>
        <p>(e) Delete all cookies when you close your browser.</p>
        <p>Please note that if you choose to block or delete cookies, certain features and functionality of the Service may not work properly or may become completely unavailable. For example, you may not be able to log in to your account, your preferences may not be saved, and certain personalized features may not function as intended.</p>
        <p>Instructions for managing cookies in common web browsers:</p>
        <p>- Google Chrome: Settings &gt; Privacy and security &gt; Cookies and other site data</p>
        <p>- Mozilla Firefox: Settings &gt; Privacy &amp; Security &gt; Cookies and Site Data</p>
        <p>- Safari: Preferences &gt; Privacy &gt; Manage Website Data</p>
        <p>- Microsoft Edge: Settings &gt; Privacy, search, and services &gt; Cookies and site permissions</p>
        <p>For detailed instructions specific to your browser version, please consult your browser&rsquo;s help documentation or support resources.</p>
        <h3>7.3 Opting Out of Third-Party Analytics Cookies</h3>
        <p>In addition to managing cookies through our consent mechanism and your browser settings, you may opt out of specific third-party analytics services:</p>
        <p><strong>Google Analytics Opt-Out:</strong> You can prevent your data from being collected and used by Google Analytics by installing the Google Analytics Opt-out Browser Add-on, available at https://tools.google.com/dlpage/gaoptout.</p>
        <p><strong>PostHog Opt-Out:</strong> You can opt out of PostHog tracking by adjusting your cookie preferences through our consent management banner or by following PostHog&rsquo;s opt-out instructions in their privacy documentation.</p>

        <h2>8. DO NOT TRACK SIGNALS</h2>
        <p>Some web browsers have a &ldquo;Do Not Track&rdquo; (DNT) feature that signals to websites that you do not want your online activities tracked. Currently, there is no universally accepted standard for how websites should respond to DNT signals.</p>
        <p>At this time, the Service does not respond to Do Not Track signals. However, you can use the cookie consent mechanism described in Section 7 to manage your cookie preferences and control the tracking technologies used on the Service.</p>

        <h2>9. UPDATES TO THIS COOKIE POLICY</h2>
        <p>We reserve the right to modify, amend, or update this Cookie Policy at any time to reflect changes in our practices, technologies, legal requirements, or for other operational, legal, or regulatory reasons.</p>
        <p>When we make changes to this Cookie Policy, we will update the &ldquo;Last Updated&rdquo; date at the top of this document. Material changes will be communicated through a prominent notice on the Service, such as a banner notification or updated consent mechanism.</p>
        <p>We encourage you to review this Cookie Policy periodically to stay informed about how we use cookies and similar technologies. Your continued use of the Service after any changes to this Cookie Policy constitutes your acceptance of such changes.</p>

        <h2>10. CONTACT INFORMATION</h2>
        <p>If you have any questions, concerns, or requests regarding this Cookie Policy or our use of cookies and similar technologies, please contact us at:</p>
        <p><strong>Email: odin@odinglynn.com</strong></p>
        <p>We will endeavor to respond to all legitimate inquiries in a timely manner.</p>

        <h2>11. ADDITIONAL RESOURCES</h2>
        <p>For more information about cookies and how they work, you may wish to visit the following independent resources:</p>
        <p>- All About Cookies: www.allaboutcookies.org</p>
        <p>- Your Online Choices: www.youronlinechoices.eu (for EU/EEA users)</p>
        <p>- Network Advertising Initiative: www.networkadvertising.org</p>
        <p>Please note that we are not responsible for the content of external websites.</p>

        <h2>12. ACKNOWLEDGMENT</h2>
        <p>BY CONTINUING TO USE THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD THIS COOKIE POLICY AND CONSENT TO OUR USE OF COOKIES AND SIMILAR TECHNOLOGIES AS DESCRIBED HEREIN, SUBJECT TO YOUR COOKIE PREFERENCE SELECTIONS.</p>
        <hr />
        <p className="text-center"><em>END OF COOKIE POLICY</em></p>
      </div>
    </div>
  </div>
);

export default CookiePolicy;
