import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

interface VerifyEmailPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

const reasonMessages: Record<string, string> = {
  missing_token: "Verification link is missing a token.",
  invalid_token: "This verification link is invalid or has already been used.",
  already_used: "This verification link was already used.",
  expired: "This verification link has expired. Request a new one below.",
};

export default function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;
  const reasonKey = typeof searchParams.reason === "string" ? searchParams.reason : undefined;
  const email = typeof searchParams.email === "string" ? searchParams.email : undefined;

  const isSuccess = status === "success";
  const isPending = status === "pending";
  const isError = status === "error";

  const description = isSuccess
    ? "Your email has been verified. You can sign in now."
    : isPending
      ? "Check your inbox for a verification link."
      : "Use the form below to request a new verification email.";

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isSuccess && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-900">
              Email verified! <Link href="/sign-in" className="underline font-medium">Sign in</Link> to continue.
            </div>
          )}

          {isError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              {reasonMessages[reasonKey ?? ""] || "We couldn\'t verify this link. Request a new one below."}
            </div>
          )}

          {isPending && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
              {email ? `We sent a verification link to ${email}.` : "We sent a verification link to your email."}
            </div>
          )}

          {!isSuccess && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">Didn&apos;t get the email? Resend it.</p>
              <ResendVerificationForm defaultEmail={email} />
            </div>
          )}

          {isSuccess && (
            <div className="text-center text-sm text-muted-foreground">
              <Link href="/sign-in" className="text-primary underline underline-offset-4">
                Go to sign in
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
