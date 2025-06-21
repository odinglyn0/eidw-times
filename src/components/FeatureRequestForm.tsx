import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { supabase } from "@/integrations/supabase/client";

interface FeatureRequestFormProps {
  isOpen: boolean;
  onClose: () => void;
}

const formSchema = z.object({
  name: z.string().max(100, "Name must be 100 characters or less").optional(),
  email: z.string().max(100, "Email must be 100 characters or less").optional(),
  details: z.string().min(10, "Details must be at least 10 characters.").max(1000, "Details must be 1000 characters or less."),
  isNameAnonymous: z.boolean().default(false),
  isEmailAnonymous: z.boolean().default(false),
}).superRefine((data, ctx) => {
  // If not anonymous, name is required and must not be empty
  if (!data.isNameAnonymous && (!data.name || data.name.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Name is required if not anonymous.",
      path: ["name"],
    });
  }

  // If not anonymous, email is required and must be a valid email
  if (!data.isEmailAnonymous) {
    if (!data.email || data.email.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email is required if not anonymous.",
        path: ["email"],
      });
    } else if (!z.string().email().safeParse(data.email).success) {
      // Explicitly validate email format here only if not anonymous and not empty
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid email address.",
        path: ["email"],
      });
    }
  }
});

const FeatureRequestForm: React.FC<FeatureRequestFormProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null); // State to store reCAPTCHA token
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      details: "",
      isNameAnonymous: false,
      isEmailAnonymous: false,
    },
  });

  const { watch, setValue } = form;
  const isNameAnonymous = watch("isNameAnonymous");
  const isEmailAnonymous = watch("isEmailAnonymous");

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    
    if (!recaptchaToken) { // Check if token is available from the checkbox
      toast({
        title: "reCAPTCHA Error",
        description: "Please complete the reCAPTCHA verification.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const payload = {
      name: values.isNameAnonymous ? null : values.name || null,
      email: values.isEmailAnonymous ? null : values.email || null,
      details: values.details,
      recaptchaToken: recaptchaToken, // Use the token from state
    };

    try {
      console.log("Invoking Edge Function 'submit-feature-request'...");
      const { data, error: edgeFunctionError } = await supabase.functions.invoke('submit-feature-request', {
        body: JSON.stringify(payload),
      });

      if (edgeFunctionError) {
        console.error("Edge Function 'submit-feature-request' error:", edgeFunctionError);
        throw edgeFunctionError;
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Success!",
        description: "Your feature request has been submitted. Thank you!",
      });
      form.reset();
      setRecaptchaToken(null); // Clear token after successful submission
      recaptchaRef.current?.reset(); // Reset reCAPTCHA checkbox
      onClose();
    } catch (error: any) {
      console.error("Error submitting feature request:", error);
      toast({
        title: "Submission Failed",
        description: error.message || "There was an error submitting your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get reCAPTCHA site key from environment variable or hardcode if necessary for client-side
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "YOUR_RECAPTCHA_SITE_KEY"; // Replace with your actual site key or ensure VITE_RECAPTCHA_SITE_KEY is set in .env.local

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Request a Feature</DialogTitle>
          <DialogDescription>
            Have an idea for a new feature? Let us know!
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-3">
                    <FormLabel htmlFor="name">Your Name</FormLabel>
                    <FormControl>
                      <Input id="name" placeholder="John Doe" {...field} disabled={isNameAnonymous || isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="col-span-1 flex flex-col items-center justify-end h-full pt-6">
                <Label htmlFor="anonymous-name" className="text-xs mb-1">Anonymous</Label>
                <Switch
                  id="anonymous-name"
                  checked={isNameAnonymous}
                  onCheckedChange={(checked) => {
                    setValue("isNameAnonymous", checked);
                    if (checked) setValue("name", ""); // Clear name if anonymous
                  }}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="col-span-3">
                    <FormLabel htmlFor="email">Your Email</FormLabel>
                    <FormControl>
                      <Input id="email" type="email" placeholder="john.doe@example.com" {...field} disabled={isEmailAnonymous || isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="col-span-1 flex flex-col items-center justify-end h-full pt-6">
                <Label htmlFor="anonymous-email" className="text-xs mb-1">Anonymous</Label>
                <Switch
                  id="anonymous-email"
                  checked={isEmailAnonymous}
                  onCheckedChange={(checked) => {
                    setValue("isEmailAnonymous", checked);
                    if (checked) setValue("email", ""); // Clear email if anonymous
                  }}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="details">Feature Details</FormLabel>
                  <FormControl>
                    <Textarea
                      id="details"
                      placeholder="Describe the feature you'd like to see..."
                      className="resize-y min-h-[80px]"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-center" style={{ zIndex: 99999 }}> {/* Added high z-index here */}
              <ReCAPTCHA
                ref={recaptchaRef}
                sitekey={recaptchaSiteKey}
                onChange={(token) => setRecaptchaToken(token)} // Store the token
                onExpired={() => setRecaptchaToken(null)} // Clear token on expiry
                size="normal" // Changed to normal for the checkbox
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || !recaptchaToken}> {/* Disable if no token */}
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FeatureRequestForm;