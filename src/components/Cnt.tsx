import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Btt';
import { Mail as MailIcon } from 'lucide-react';

const ContactPageLink: React.FC = () => {
  return (
    <Link to="/contact" className="absolute top-4 left-4 z-10">
      <Button
        variant="ghost"
        size="icon"
        className="bg-white rounded-full shadow-md border border-gray-300 text-blue-800 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-blue-200 dark:hover:bg-gray-700"
      >
        <MailIcon className="h-5 w-5" />
        <span className="sr-only">Contact</span>
      </Button>
    </Link>
  );
};

export default ContactPageLink;
