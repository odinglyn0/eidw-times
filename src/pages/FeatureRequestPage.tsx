import React from 'react';
import FeatureRequestForm from '@/components/FeatureRequestForm';
import AcknowledgedRequestsDisplay from '@/components/AcknowledgedRequestsDisplay'; // Import the new component
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const FeatureRequestPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8"> {/* Adjusted for side-by-side on large screens */}
        <div className="lg:w-1/2"> {/* Form takes half width on large screens */}
          <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Link>
          <FeatureRequestForm />
        </div>
        <div className="lg:w-1/2"> {/* Display takes other half width on large screens */}
          <AcknowledgedRequestsDisplay />
        </div>
      </div>
    </div>
  );
};

export default FeatureRequestPage;