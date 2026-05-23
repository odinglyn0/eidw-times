import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Crd";
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const CONTACT_EMAIL = "eidwtimes@proton.me";

const Contact: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Link>

        <Card className="w-full border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
          <CardHeader className="bg-gray-100 dark:bg-gray-800 p-4 text-gray-800 dark:text-gray-200 text-center">
            <CardTitle className="text-2xl font-bold">Contact</CardTitle>
            <CardDescription>Get in touch with... a developer.</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
              For any inquiries, whether that's data, maintenance, or just a general chat, contact:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Contact;
