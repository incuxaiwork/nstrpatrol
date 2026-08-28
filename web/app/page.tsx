import { redirect } from "next/navigation";
import { AUTH_DEFAULT_LANDING } from "@/lib/constants";

export default function Home() {
  redirect(AUTH_DEFAULT_LANDING);
}