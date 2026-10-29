# Store cases relationally in PostgreSQL and PostGIS

The shared-instance release will store case data in relational PostgreSQL tables and use PostGIS for spatial data, rather than persist the entire case as a JSON/JSONB document. Import and export adapters will map between those records and the versioned JSON contract. This favors an explicit relational and spatial model at the cost of mapping and transactional replacement logic; the existing committed-document boundary in the browser remains a separate concern.
