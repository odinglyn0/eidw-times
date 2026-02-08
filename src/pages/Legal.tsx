import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Crd";
import { Button } from "@/components/ui/Btt";

const policies = [
  {
    title: "Terms of Service",
    route: "/terms",
    docx: "/legal/terms.docx",
  },
  {
    title: "Privacy Policy",
    route: "/privacy",
    docx: "/legal/privacy.docx",
  },
  {
    title: "Cookie Policy",
    route: "/cookies",
    docx: "/legal/cookies.docx",
  },
];

const Legal = () => (
  <div className="min-h-screen flex flex-col items-center px-4 py-8">
    <div className="w-full max-w-3xl">
      <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
      </Link>
      <h1 className="text-2xl font-bold text-center mb-6 text-gray-800 dark:text-gray-200">Legal Policies</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {policies.map((p) => (
          <Card key={p.route} className="border-2 border-gray-300 dark:border-gray-600 shadow-lg">
            <CardHeader className="bg-gray-100 dark:bg-gray-800 p-4 text-center">
              <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200">{p.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-3">
              <Button asChild variant="default" className="w-full">
                <Link to={p.route}>
                  <FileText className="mr-2 h-4 w-4" /> Read Online
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <a href={p.docx} download>
                  <Download className="mr-2 h-4 w-4" /> Download .docx
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </div>
);

export default Legal;
