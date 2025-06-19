import TerminalSecurityCard from "@/components/TerminalSecurityCard";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-gray-100">Dublin Airport Security Times</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Real-time updates and historical data for T1 and T2.
        </p>
      </div>
      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8 justify-center">
        <TerminalSecurityCard terminalId={1} />
        <TerminalSecurityCard terminalId={2} />
      </div>
    </div>
  );
};

export default Index;