import { Suspense } from "react";
import { PaiementsClient } from "./paiements-client";

export default function Page() {
  return (
    <Suspense>
      <PaiementsClient/>
    </Suspense>
  );
}
