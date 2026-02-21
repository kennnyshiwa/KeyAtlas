import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export const metadata = {
  title: "Sign In - KeyAtlas",
  description: "Sign in to KeyAtlas",
};

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">Welcome to KeyAtlas</CardTitle>
          <CardDescription>
            Sign in to track group buys, interest checks, and more
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SignInForm />
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">or continue with</p>
            <SignInButtons />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account? {" "}
            <Link href="/sign-up" className="text-primary underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
