import React from 'react';
import DublinAirportLogo from "@/assets/Dublin_airport_logo.svg.png";

const PhoneNotch: React.FC = () => {
  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-white border border-gray-700 rounded-b-3xl px-6 py-2 shadow-lg flex items-center justify-center dark:bg-gray-800 dark:border-gray-600">
        <img
          src={DublinAirportLogo}
          alt="Dublin Airport Logo"
          className="h-10 w-auto"
        />
      </div>
    </div>
  );
};

export default PhoneNotch;