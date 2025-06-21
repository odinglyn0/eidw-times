import React from 'react';
import FeatureRequestForm from '@/components/FeatureRequestForm';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const FeatureRequestPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Link>
        <FeatureRequestForm />
      </div>
    </div>
  );
};

export default FeatureRequestPage;