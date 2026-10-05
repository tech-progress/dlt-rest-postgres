SELECT count(*) AS rows, count(DISTINCT id) AS unique_orders,
       sum(amount_cents) AS revenue_cents,
       to_timestamp(max(updated_at)) AS newest_source_update
FROM rest_warehouse.orders;

SELECT status, count(*) AS orders, sum(amount_cents) AS revenue_cents
FROM rest_warehouse.orders
GROUP BY status
ORDER BY status;

SELECT id, count(*) AS occurrences
FROM rest_warehouse.orders
GROUP BY id
HAVING count(*) <> 1;

SELECT count(*) AS completed_loads, max(inserted_at) AS newest_completed_load
FROM rest_warehouse._dlt_loads
WHERE status = 0;
