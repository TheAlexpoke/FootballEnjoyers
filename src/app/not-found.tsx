import Link from "next/link";
export default function NotFound() {
  return (
    <main className="container">
      <h1>Out of bounds.</h1>
      <Link href="/">Return to standings</Link>
    </main>
  );
}
