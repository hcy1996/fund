import { Suspense } from "react";
import { PkPage } from "@/components/pk/pk-page";

export default function PkRoute() {
  return (
    <Suspense fallback={null}>
      <PkPage />
    </Suspense>
  );
}

