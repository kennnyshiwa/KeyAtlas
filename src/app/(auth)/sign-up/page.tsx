import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { SignInButtons } from "@/components/auth/sign-in-buttons";

export const metadata = {
  title: "Sign Up - KeyAtlas",
  description: "Create a KeyAtlas account",
};

export default async function SignUpPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join the community and track the projects you love.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SignUpForm />
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">or continue with</p>
            <SignInButtons />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account? {" "}
            <Link href="/sign-in" className="text-primary underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
