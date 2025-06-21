import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon } from 'lucide-react';

const SettingsPageLink: React.FC = () => {
  return (
    <Link to="/settings" className="absolute top-4 right-4 z-10">
      <Button 
        variant="ghost" 
        size="icon" 
        className="bg-white rounded-full shadow-md border border-gray-300 text-blue-800 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-blue-200 dark:hover:bg-gray-700"
      >
        <SettingsIcon className="h-5 w-5" />
        <span className="sr-only">Settings</span>
      </Button>
    </Link>
  );
};

export default SettingsPageLink;