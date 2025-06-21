import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getAutoPollEnabled, setAutoPollEnabled, getAutoPollInterval, setAutoPollInterval, getCookieConsent, setCookieConsent } from '@/lib/cookies';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Settings: React.FC = () => {
  const { toast } = useToast();
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // Default to 30 seconds
  const [hasCookieConsent, setHasCookieConsent] = useState(false);

  useEffect(() => {
    setAutoRefreshEnabled(getAutoPollEnabled());
    setRefreshInterval(getAutoPollInterval());
    setHasCookieConsent(getCookieConsent());
  }, []);

  const handleAutoRefreshToggle = (checked: boolean) => {
    setAutoRefreshEnabled(checked);
    setAutoPollEnabled(checked);
    toast({
      title: "Auto-refresh setting updated",
      description: `Auto-refresh is now ${checked ? "enabled" : "disabled"}.`,
    });
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 5) { // Minimum 5 seconds for interval
      setRefreshInterval(value);
      setAutoPollInterval(value);
      toast({
        title: "Refresh interval updated",
        description: `Data will refresh every ${value} seconds.`,
      });
    } else if (e.target.value === "") {
      setRefreshInterval(0); // Allow empty input temporarily
    } else {
      toast({
        title: "Invalid interval",
        description: "Please enter a number greater than or equal to 5.",
        variant: "destructive",
      });
    }
  };

  const handleGiveCookieConsent = () => {
    setCookieConsent(true);
    setHasCookieConsent(true);
    toast({
      title: "Cookie consent granted",
      description: "Your preferences will now be saved.",
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Link>

        <Card className="w-full border-2 border-gray-300 rounded-lg shadow-lg">
          <CardHeader className="bg-gray-100 p-4 text-gray-800 text-center">
            <CardTitle className="text-2xl font-bold">User Settings</CardTitle>
            <CardDescription>Manage your application preferences.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Dark mode toggle removed */}

            <div className="flex items-center justify-between">
              <Label htmlFor="auto-refresh" className="text-base">
                Enable Auto-Refresh
              </Label>
              <Switch
                id="auto-refresh"
                checked={autoRefreshEnabled}
                onCheckedChange={handleAutoRefreshToggle}
                disabled={!hasCookieConsent}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refresh-interval" className="text-base">
                Refresh Interval (seconds)
              </Label>
              <Input
                id="refresh-interval"
                type="number"
                value={refreshInterval === 0 ? "" : refreshInterval}
                onChange={handleIntervalChange}
                min="5"
                placeholder="e.g., 30"
                disabled={!autoRefreshEnabled || !hasCookieConsent}
              />
              <p className="text-sm text-muted-foreground">
                Data will automatically refresh every specified seconds. Minimum 5 seconds.
              </p>
            </div>

            {!hasCookieConsent && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md">
                <p className="font-semibold mb-2">Cookie Consent Required</p>
                <p className="text-sm mb-4">
                  To save your settings, please accept cookies.
                </p>
                <Button onClick={handleGiveCookieConsent} className="bg-red-600 hover:bg-red-700 text-white">
                  Accept Cookies
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;