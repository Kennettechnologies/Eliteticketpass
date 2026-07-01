import { redirect } from "next/navigation";

export default function DashboardScannerRedirect() {
  redirect("/checkin");
}
