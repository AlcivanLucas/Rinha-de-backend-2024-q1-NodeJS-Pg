// Configurar a Conexão com o Banco de Dados

const { Pool } = require('pg');

const pool = new Pool({
 user: 'admin',
 host: 'db',
 database: 'rinha',
 password: '123',
 port: 5432,
});

//async function query(text: string, params?: any[]): Promise<QueryResult<any>> 
async function query(text:any, params:any, client = pool) {
   try {
      const res = await client.query(text, params);
      return res.rows;
   } finally {
      if (client !== pool) {
        client.release();
      }
   }
  }

// module.exports = { query };
export { query };
export { pool };

// 
