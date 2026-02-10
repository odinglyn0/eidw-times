import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Crd";
import { Switch } from "@/components/ui/Sw";
import { Label } from "@/components/ui/Lbl";
import { Input } from "@/components/ui/In";
import { Button } from "@/components/ui/Btt";
import { useToast } from "@/components/ui/use-toast";
import { getAutoPollEnabled, setAutoPollEnabled, getAutoPollInterval, setAutoPollInterval, getDarkMode, setDarkMode, getShowRecommendation, setShowRecommendation, getForecastModel, setForecastModel, getSecurityViewMode, setSecurityViewMode } from '@/lib/cookies';
import { useCookieConsent } from '@/integrations/cookie-consent/CookieConsentProvider';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from 'next-themes';

const Settings: React.FC = () => {
  const { toast } = useToast();
  const { setTheme, theme } = useTheme();
  const { hasConsent: hasCookieConsent } = useCookieConsent();
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showRecommendation, setShowRecommendationState] = useState(true);
  const [forecastModel, setForecastModelState] = useState<'liminal' | 'trition'>('trition');
  const [securityViewMode, setSecurityViewModeState] = useState<'graph' | 'tiles'>('graph');

  useEffect(() => {
    setAutoRefreshEnabled(getAutoPollEnabled());
    setRefreshInterval(getAutoPollInterval());
    setShowRecommendationState(getShowRecommendation());
    setForecastModelState(getForecastModel());
    setSecurityViewModeState(getSecurityViewMode());
    const cookieDark = getDarkMode();
    if (cookieDark !== null) {
      setIsDarkMode(cookieDark);
      setTheme(cookieDark ? 'dark' : 'light');
    } else {
      const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      const defaultDark = !systemPrefersLight;
      setIsDarkMode(defaultDark);
      setTheme(defaultDark ? 'dark' : 'light');
    }
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
    if (!isNaN(value) && value >= 5) {
      setRefreshInterval(value);
      setAutoPollInterval(value);
      toast({
        title: "Refresh interval updated",
        description: `Data will refresh every ${value} seconds.`,
      });
    } else if (e.target.value === "") {
      setRefreshInterval(0);
    } else {
      toast({
        title: "Invalid interval",
        description: "Please enter a number greater than or equal to 5.",
        variant: "destructive",
      });
    }
  };

  const handleDarkModeToggle = (checked: boolean) => {
    setIsDarkMode(checked);
    setDarkMode(checked);
    setTheme(checked ? 'dark' : 'light');
    toast({
      title: "Theme updated",
      description: `Switched to ${checked ? "dark" : "light"} mode.`,
    });
  };

  const handleShowRecommendationToggle = (checked: boolean) => {
    setShowRecommendationState(checked);
    setShowRecommendation(checked);
    toast({
      title: "Recommendation updated",
      description: `Terminal recommendation is now ${checked ? "visible" : "hidden"}.`,
    });
  };

  const handleForecastModelChange = (model: 'liminal' | 'trition') => {
    setForecastModelState(model);
    setForecastModel(model);
    toast({
      title: "Forecast model updated",
      description: `Switched to ${model === 'trition' ? 'v2 Trition' : 'v1 Liminal'}.`,
    });
  };

  const handleSecurityViewModeChange = (mode: 'graph' | 'tiles') => {
    setSecurityViewModeState(mode);
    setSecurityViewMode(mode);
    toast({
      title: "Security times view updated",
      description: `Switched to ${mode === 'graph' ? 'Graph' : 'Tiles'} view.`,
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Link>

        <Card className="w-full border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
          <CardHeader className="bg-gray-100 dark:bg-gray-800 p-4 text-gray-800 dark:text-gray-200 text-center">
            <CardTitle className="text-2xl font-bold">User Settings</CardTitle>
            <CardDescription>Manage your application preferences.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="dark-mode" className="text-base">
                Dark Mode
              </Label>
              <Switch
                id="dark-mode"
                checked={isDarkMode}
                onCheckedChange={handleDarkModeToggle}
                disabled={!hasCookieConsent}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="show-recommendation" className="text-base">
                Show Recommendation
              </Label>
              <Switch
                id="show-recommendation"
                checked={showRecommendation}
                onCheckedChange={handleShowRecommendationToggle}
                disabled={!hasCookieConsent}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-base">Forecast Model</Label>
              <div className="flex gap-2">
                <Button
                  variant={forecastModel === 'trition' ? 'default' : 'outline'}
                  size="sm"
                  className={forecastModel === 'trition' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                  onClick={() => handleForecastModelChange('trition')}
                  disabled={!hasCookieConsent}
                >
                  v2 Trition
                </Button>
                <Button
                  variant={forecastModel === 'liminal' ? 'default' : 'outline'}
                  size="sm"
                  className={forecastModel === 'liminal' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                  onClick={() => handleForecastModelChange('liminal')}
                  disabled={!hasCookieConsent}
                >
                  v1 Liminal
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Controls which prediction engine is used for forecasts.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-base">Security Times View</Label>
              <div className="flex gap-2">
                <Button
                  variant={securityViewMode === 'graph' ? 'default' : 'outline'}
                  size="sm"
                  className={securityViewMode === 'graph' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                  onClick={() => handleSecurityViewModeChange('graph')}
                  disabled={!hasCookieConsent}
                >
                  Graph
                </Button>
                <Button
                  variant={securityViewMode === 'tiles' ? 'default' : 'outline'}
                  size="sm"
                  className={securityViewMode === 'tiles' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                  onClick={() => handleSecurityViewModeChange('tiles')}
                  disabled={!hasCookieConsent}
                >
                  Tiles
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose how security wait times are displayed.
              </p>
            </div>

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

          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;