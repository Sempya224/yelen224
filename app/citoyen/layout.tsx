import { CitoyenGuard } from "./citoyen-guard";

export default function CitoyenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CitoyenGuard>{children}</CitoyenGuard>;
}
