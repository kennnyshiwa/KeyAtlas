import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Sign In - KeyVault",
  description: "Sign in to KeyVault",
};

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to KeyVault</CardTitle>
          <CardDescription>
            Sign in to track group buys, interest checks, and more
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInButtons />
        </CardContent>
      </Card>
    </div>
  );
}
