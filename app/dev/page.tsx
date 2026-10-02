import { notFound } from "next/navigation";
import FashionTryOn from "@/components/FashionTryOn";

export const dynamic = "force-dynamic";

export default function DevelopmentValidation() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_DEV_VALIDATION_PAGE !== "true"
  ) {
    notFound();
  }
  return <FashionTryOn />;
}
