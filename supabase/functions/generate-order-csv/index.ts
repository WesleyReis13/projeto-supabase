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
    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({
        error: 'order_id is required'
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
    const { data: order, error: orderError } = await supabaseClient.from('orders').select(`
        id,
        total,
        status,
        created_at,
        user_id,
        order_items(
          quantity,
          price_at_time,
          products:product_id(name)
        )
      `).eq('id', order_id).single();
    if (orderError) {
      throw new Error(`Error fetching order: ${orderError.message}`);
    }
    if (!order) {
      throw new Error('Order not found');
    }
    const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('full_name').eq('id', order.user_id).single();
    if (profileError) {
      console.log('Profile not found, using default name');
    }
    const customerName = profile?.full_name || 'Cliente';
    const csvHeader = 'Order ID,Customer Name,Product,Quantity,Unit Price,Subtotal,Order Date,Status\n';
    const csvRows = order.order_items.map((item)=>`"${order.id}","${customerName}","${item.products.name}",${item.quantity},${item.price_at_time},${item.quantity * item.price_at_time},"${new Date(order.created_at).toLocaleDateString()}","${order.status}"`).join('\n');
    const csvContent = csvHeader + csvRows;
    const summaryRow = `\n\n"TOTAL","","","","","${order.total}","",""`;
    const finalCsv = csvContent + summaryRow;
    return new Response(finalCsv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="order-${order.id}.csv"`,
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Error in generate-order-csv:', error);
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
