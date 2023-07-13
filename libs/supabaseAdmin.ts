import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

import { Database } from "@/types_db";
import { Price, Product } from "@/types";

import { stripe } from "./stripe";
import { toDataTime } from "./helpers";

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const upsertProductRecord = async (product: Stripe.Product) => {
  const { id, active, name, description, images, metadata } = product;
  const productData: Product = {
    id,
    active,
    name,
    description: description ?? undefined,
    image: images?.[0] ?? null,
    metadata
  };

  const { error } = await supabaseAdmin
    .from("products")
    .upsert([productData]);

  if (error) {
    throw error;
  }

  console.log(`Product inserted/updated: ${product.id}`);
};

const upsertPriceRecord =async (price:Stripe.Price) => {
  const { id, active, product, currency, nickname, type, unit_amount, recurring, metadata } = price;
  const priceData: Price = {
    id,
    product_id: typeof product === "string" ? product : "",
    active,
    currency,
    description: nickname ?? undefined,
    type,
    unit_amount: unit_amount ?? undefined,
    interval: recurring?.interval,
    interval_count: recurring?.interval_count,
    trial_period_days: recurring?.trial_period_days,
    metadata
  };

  const { error } = await supabaseAdmin
    .from("prices")
    .upsert([priceData]);

  if (error) {
    throw error;
  }

  console.log(`Price inserted/updated: ${price.id}`);
};

const createOrRetrieveACustomer = async ({
  email,
  uuid
}: {
  email: string,
  uuid: string
}) => {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", uuid)
    .single();

  if (error || !data?.stripe_customer_id) {
    const customerData: { metaData: { supabaseUUID: string }; email?: string } = {
      metaData: {
        supabaseUUID: uuid
      }
    };

    if (email) customerData.email = email;

    const customer = await stripe.customers.create(customerData);
    const { error: supabaseError } = await supabaseAdmin
      .from("customers")
      .insert([{ id: uuid, stripe_customer_id:customer.id }]);

    if (supabaseError) {
      throw supabaseError;
    }

    console.log(`New customer created and inserted for ${uuid}`);
    return customer.id;
  }

  return data.stripe_customer_id;
}

const copyBillingDetailsToCustomer = async (
  uuid: string,
  payment_method: Stripe.PaymentMethod
) => {
  const customer = payment_method.customer as string;
  const { name, phone, address } = payment_method.billing_details;
  if (!name || !phone|| !address) return;

  // @ts-ignore
  await stripe.customers.update(customer, { name, phone, address });
  const { error } = await supabaseAdmin
    .from("users")
    .update({
      billing_address: { ...address },
      payment_method: { ...payment_method[payment_method.type] }
    })
    .eq("id", uuid);

  if (error) throw error;
};

const manageSubscriptionStatusChange = async (
  subscriptionId: string,
  customerId: string,
  createAction = false
) => {
  const { data: customerData, error: noCustomerError } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (noCustomerError) throw noCustomerError;

  const { id: uuid } = customerData!;

  const subscription = await stripe.subscriptions.retrieve(
    subscriptionId,
    {
      expand: ["default_payment_method"]
    }
  );

  const {
    id,
    metadata,
    status,
    cancel_at_period_end,
    cancel_at,
    canceled_at,
    current_period_start,
    current_period_end,
    created,
    ended_at,
    trial_start,
    trial_end
  } = subscription;

  const subscriptionData: Database["public"]["Tables"]["subscriptions"]["Insert"] = {
    id,
    user_id: uuid,
    metadata,
    // @ts-ignore
    status,
    price_id: subscription.items.data[0].price.id,
    // @ts-ignore
    quantity: subscription.quantity,
    cancel_at_period_end,
    cancel_at: cancel_at ? toDataTime(cancel_at).toISOString() : null,
    canceled_at: canceled_at ? toDataTime(canceled_at).toISOString() : null,
    current_period_start: toDataTime(current_period_start).toISOString(),
    current_period_end: toDataTime(current_period_end).toISOString(),
    created: toDataTime(created).toISOString(),
    ended_at: ended_at ? toDataTime(ended_at).toISOString() : null,
    trial_start: trial_start ? toDataTime(trial_start).toISOString() : null,
    trial_end: trial_end ? toDataTime(trial_end).toISOString() : null,
  };

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert([subscriptionData]);

  if (error) throw error;

  console.log(`Inserted / Updated subscription [${subscription.id} for ${uuid}]`);

  if (createAction && subscription.default_payment_method && uuid) {
    await copyBillingDetailsToCustomer(
      uuid,
      subscription.default_payment_method as Stripe.PaymentMethod
    );
  }
};

export {
  upsertPriceRecord,
  upsertProductRecord,
  createOrRetrieveACustomer,
  manageSubscriptionStatusChange
}
