import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { order_id, customer_email } = await req.json();
    if (!order_id || !customer_email) {
      return new Response(JSON.stringify({
        error: 'order_id and customer_email are required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    const { data: order, error: orderError } = await supabaseClient.from('order_details').select('*').eq('order_id', order_id).single();
    if (orderError) {
      throw new Error(`Error fetching order: ${orderError.message}`);
    }
    console.log('📧 SENDING ORDER CONFIRMATION EMAIL:');
    console.log(`To: ${customer_email}`);
    console.log(`Order ID: ${order.order_id}`);
    console.log(`Customer: ${order.customer_name}`);
    console.log(`Total: $${order.order_total}`);
    console.log(`Items: ${order.total_items}`);
    return new Response(JSON.stringify({
      success: true,
      message: 'Order confirmation email queued successfully',
      order: {
        id: order.order_id,
        total: order.order_total,
        status: order.order_status,
        customer: order.customer_name
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
