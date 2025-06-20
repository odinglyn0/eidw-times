import React, { useRef, useEffect, useState, useCallback } from 'react';
import DublinAirportLogo from "@/assets/Dublin_airport_logo.svg.png";
import { cn } from "@/lib/utils";

const SCROLL_THRESHOLD = 100; // Pixels scrolled down before the notch starts collapsing

const PhoneNotch: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const lastScrollY = useRef(0);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;

    if (currentScrollY > SCROLL_THRESHOLD) {
      // User has scrolled down past the threshold
      if (currentScrollY > lastScrollY.current) {
        // Scrolling down
        setIsCollapsed(true);
      } else {
        // Scrolling up
        setIsCollapsed(false);
      }
    } else {
      // User is near the top of the page
      setIsCollapsed(false);
    }
    lastScrollY.current = currentScrollY;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    // Initial check in case the page loads already scrolled
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // The notch should be collapsed if it's marked as collapsed by scroll AND not currently hovered
  const shouldBeCollapsed = isCollapsed && !isHovered;

  return (
    <div
      className={cn(
        "fixed top-0 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-in-out",
        shouldBeCollapsed ? "-translate-y-full" : "translate-y-0"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
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