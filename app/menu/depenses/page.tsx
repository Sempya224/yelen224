import { Suspense } from "react";
import { DepensesClient } from "./depenses-client";

export default function Page() {
  return (
    <Suspense>
      <DepensesClient/>
    </Suspense>
  );
}
