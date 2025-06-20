import React from 'react';

const BottomNotch: React.FC = () => {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full">
      <div className="bg-white border border-gray-700 rounded-t-3xl px-6 py-2 shadow-lg flex flex-col items-center justify-center dark:bg-gray-800 dark:border-gray-600 text-center">
        <div className="text-gray-600 dark:text-gray-400 text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4">
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
        <div className="mt-2 text-gray-500 dark:text-gray-400 text-xs">
          <p>
            Disclaimer: This is a personal project and is in no way affiliated with the DAA or Dublin Airport.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BottomNotch;