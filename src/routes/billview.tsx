import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ApiError, billViewApi, type RawBillViewData } from "@/lib/api";

// Public, unauthenticated customer-facing page - the link controller/kto.js#
// sentEbill sends over WhatsApp (`${SOCKET_URL}/billview?bill_no=...&id=...`)
// points here. No layout/auth shell (unlike every other route, all under
// _shell) - a customer has no BillerPe login of any kind, and never should
// need one just to see their own receipt. bill_no/id in the URL are the
// hashed values the backend itself generated (generateHashId) - read
// straight from the query string and passed straight through to
// billViewApi.getDetails unchanged; only the backend ever decodes them.
export const Route = createFileRoute("/billview")({
  head: () => ({
    meta: [{ title: "Your bill · BillerPe" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: BillViewPage,
});

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: RawBillViewData };

function BillViewPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billNo = params.get("bill_no");
    const id = params.get("id");
    if (!billNo || !id) {
      setState({
        status: "error",
        message: "This bill link is missing information and can't be opened.",
      });
      return;
    }
    let cancelled = false;
    billViewApi
      .getDetails(billNo, id)
      .then(({ data }) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof ApiError ? err.message : "Could not load this bill. Please try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <Shell>
        <p className="text-center text-sm text-muted-foreground">Loading your bill…</p>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell>
        <p className="text-center text-sm text-muted-foreground">{state.message}</p>
      </Shell>
    );
  }

  const d = state.data;
  const currency = d.currency ?? "₹";

  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-lg font-semibold">{d.restaurantName}</h1>
        {d.restaurantAddress ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{d.restaurantAddress}</p>
        ) : null}
        {d.restaurantNumber ? (
          <p className="text-xs text-muted-foreground">{d.restaurantNumber}</p>
        ) : null}
        {d.headerText?.length ? (
          <div
            className="mt-2 text-xs [&_img]:mx-auto"
            // Trusted server-rendered markup from the hotel's own Invoice
            // Format settings - see RawBillViewData's own comment.
            dangerouslySetInnerHTML={{ __html: d.headerText.join("") }}
          />
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between border-y border-dashed border-border py-2 text-xs text-muted-foreground">
        <span>Bill #{d.orderId}</span>
        <span>{d.dateAndTime}</span>
      </div>

      {d.tableAndUserInfo ? (
        <p className="mt-2 text-xs text-muted-foreground">{d.tableAndUserInfo}</p>
      ) : null}
      {d.customerName ? (
        <p className="text-xs text-muted-foreground">
          {d.customerName}
          {d.customerNumber ? ` · ${d.customerNumber}` : ""}
        </p>
      ) : null}

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1 font-normal">Item</th>
            <th className="py-1 text-right font-normal">Qty</th>
            <th className="py-1 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((item, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="py-1.5 pr-2">
                {item.item_name}
                {item.variantData?.variants_name ? ` (${item.variantData.variants_name})` : ""}
              </td>
              <td className="py-1.5 text-right num">{item.qty}</td>
              <td className="py-1.5 text-right num">
                {currency}
                {item.totalAmount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-1 text-sm">
        <Row label="Subtotal" value={`${currency}${d.subtotal}`} />
        {d.totalDiscount ? <Row label="Discount" value={`-${currency}${d.totalDiscount}`} /> : null}
        {d.service_charge ? (
          <Row label="Service charge" value={`${currency}${d.service_charge}`} />
        ) : null}
        {d.delivery_charge ? (
          <Row label="Delivery charge" value={`${currency}${d.delivery_charge}`} />
        ) : null}
        {d.packaging_charge ? (
          <Row label="Packaging charge" value={`${currency}${d.packaging_charge}`} />
        ) : null}
        {d.orderTax.map((t, i) => (
          <Row
            key={i}
            label={t.hms_tax_type_mst?.tax_name ?? "Tax"}
            value={`${currency}${t.amount ?? 0}`}
          />
        ))}
        {d.tip ? <Row label="Tip" value={`${currency}${d.tip}`} /> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
          <span>Total</span>
          <span className="num">
            {currency}
            {d.totalBill}
          </span>
        </div>
      </div>

      {d.footerText?.length ? (
        <div
          // [&_img]:mx-auto centers the UPI QR <img> the backend renders
          // here (controller/kto.js#getHearderAndFooterDataBillView emits
          // it with no margin/alignment of its own, so an inline <img>
          // defaults to sitting flush left) - the header wrapper below
          // already had this; the footer one (where upi-qr normally lives,
          // per the default footer line order) didn't, which is why the
          // QR showed up left-aligned instead of centered.
          className="mt-4 text-center text-xs text-muted-foreground [&_img]:mx-auto"
          dangerouslySetInnerHTML={{ __html: d.footerText.join("") }}
        />
      ) : null}
      {d.bottomText ? (
        <p className="mt-1 whitespace-pre-wrap text-center text-xs text-muted-foreground">
          {d.bottomText}
        </p>
      ) : null}
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-muted px-4 py-8">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-sm">
        {children}
      </div>
    </div>
  );
}
