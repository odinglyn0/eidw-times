import TerminalSecurityCard from "@/components/TerminalSecurityCard";
import DublinAirportLogo from "@/assets/Dublin_airport_logo.svg.png"; // Import the logo

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-gray-100">Dublin Airport Security Times</h1>
        <img
          src={DublinAirportLogo}
          alt="Dublin Airport Logo"
          className="mx-auto h-16 w-auto"
        />
      </div>
      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8 justify-center">
        <TerminalSecurityCard terminalId={1} />
        <TerminalSecurityCard terminalId={2} />
      </div>
      <div className="mt-8 text-center text-gray-600 dark:text-gray-400 text-sm">
        Made with ❤️ from{" "}
        <a
          href="https://odinglynn.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline"
        >
          Odin Glynn Photography
        </a>
      </div>
    </div>
  );
};

export default Index;