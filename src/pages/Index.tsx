import TerminalSecurityCard from "@/components/TerminalSecurityCard";
import DublinAirportLogo from "@/assets/Dublin_airport_logo.svg.png"; // Import the logo
import { MadeWithDyad } from "@/components/made-with-dyad"; // Import MadeWithDyad component

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
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
      <div className="mt-8 text-center text-gray-600 dark:text-gray-400 text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4">
        <span>
          Made with ❤️ from{" "}
          <a
            href="https://odinglynn.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline"
          >
            Odin Glynn Photography
          </a>
        </span>
        <span>
          🔥 Carrying on the legacy from{" "}
          <a
            href="https://www.reddit.com/r/ireland/comments/utoxj2/a_friend_of_mine_made_a_website_that_pulls_the/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline"
          >
            this project
          </a>
        </span>
      </div>
      <div className="mt-4 text-center text-gray-500 dark:text-gray-400 text-xs">
        <p>
          Disclaimer: This is a personal project and is in no way affiliated with the DAA or Dublin Airport.
        </p>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;