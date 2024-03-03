import express from 'express';
import { Request, Response } from 'express';
import {z } from 'zod';

import { query } from '../utils/pg-conf-db';
import { pool } from '../utils/pg-conf-db';

const app = express();
require('dotenv').config();
app.use(express.json());

app.get('/clientes/:id/extrato', async (req: Request, res: Response) => {
    let statuscode = 200; // só para exibir o statuscode no console
    try {
        const clienteId = parseInt(req.params.id);
        const data_extrato = new Date().toISOString(); // Converte para o formato ISO string

        // Verificando se o ID do cliente está dentro do intervalo esperado
        if (clienteId >= 1 && clienteId <= 5) {
            // Consulta SQL para buscar o saldo e as últimas transações do cliente
            const result = await query(`
                SELECT c.saldo, c.limite, t.realizada_em, t.valor, t.tipo, t.descricao
                FROM clientes c
                LEFT JOIN transacoes t ON c.id = t.cliente_id
                WHERE c.id = $1
                ORDER BY t.realizada_em DESC
                LIMIT 11
            `, [clienteId]);

            // Separando o saldo e as transações
            const saldo = result[0];
            const ultimas_transacoes = result.slice(1).map((transacao: { valor: any; tipo: any; descricao: any; realizada_em: any; }) => ({
                valor: transacao.valor,
                tipo: transacao.tipo,
                descricao: transacao.descricao,
                realizada_em: transacao.realizada_em
            }));

            res.status(200).json({
                saldo: {
                    total: saldo.saldo,
                    data_extrato: data_extrato,
                    limite: saldo.limite,
                },
                ultimas_transacoes,
            });
        } else {
            // Caso contrário, lançamos um erro com status 400 (Bad Request)
            res.status(404).send('ID de cliente inválido');
        }
    } catch (error) {
        console.error(error);
        res.status(404).json({ error: 'deu erro em alguma coisa dentro do try' });
    } finally {
        console.log("id do cliente:", parseInt(req.params.id), "status", statuscode);
    }
});



// Rota para criar transações de um cliente específico
app.post('/clientes/:id/transacoes', async  (req: Request, res: Response) => {
    let statuscode = 200; // só para exibir o statuscode no console
    let {saldo, limite} = {saldo: 0, limite: 0};
    try {
        // recebe i ID do cliente na requisição
        const clienteId = parseInt(req.params.id);
    
        // Verificando se o corpo da requisição não está vazio
        if (!req.body) {
            throw new Error('Corpo da requisição está vazio');
        }      

        // Verificando se o ID do cliente está dentro do intervalo esperado
        if (clienteId >= 1 && clienteId <= 5) {
            const createClienteBody = z.object({
                valor: z.number().int().positive(),
                tipo: z.string().max(1),
                descricao: z.string().max(10).min(1)
            })

            // desestrutura o corpo da requisição 
            const { valor, tipo, descricao } = createClienteBody.parse(req.body);

            // Inicia uma transação
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Busca o cliente no banco de dados
                const cliente = await query('SELECT saldo, limite FROM clientes WHERE id = $1', [clienteId]);

                // Verifica se o cliente foi encontrado
                if (!cliente.length) {
                    throw new Error('Cliente não encontrado');
                }

                let newBalance = 0;
                // Verifica se o cliente foi encontrado
                if (tipo === 'd' || tipo === 'c') {
                    // Calcula o novo saldo com base no tipo de transação
                    if (tipo === 'd') {
                        newBalance = cliente[0].saldo - valor;
                    } else if (tipo === 'c') {
                        newBalance = cliente[0].saldo + valor;
                    }

                    saldo = newBalance;
                    limite = cliente[0].limite;

                    // Verifica se o novo saldo excede o limite
                    if ((-1 * cliente[0].limite) > newBalance) {
                        throw new Error('Transação não permitida pois excede o limite');
                    }
                    
                    // Cria a transação e atualiza o saldo do cliente em uma única transação
                    await client.query(`
                        INSERT INTO transacoes (valor, tipo, descricao, cliente_id, realizada_em)
                        VALUES ($1, $2, $3, $4, NOW())
                        RETURNING id;
                    `, [valor, tipo, descricao, clienteId]);

                    await client.query(`
                        UPDATE clientes SET saldo = $1 WHERE id = $2;
                    `, [newBalance, clienteId]);

                    // Confirma a transação
                    await client.query('COMMIT');

                    // Retorna o saldo e o limite do cliente
                    res.status(200).json({ limite: cliente[0].limite, saldo: newBalance });
                } else{
                    statuscode = 422;
                    throw new Error('Tipo de transação inválido');
                }                
            } catch (error) {
                // Desfaz a transação em caso de erro
                await pool.query('ROLLBACK');
                throw error;
            }
        } else {
            // Caso contrário, lançamos um erro com status 400 (Bad Request)
            console.log('ID de cliente inválido')
            statuscode = 404;            
            res.status(404).send('ID de cliente inválido');
        }

    } catch (error) {
        // Caso ocorra algum erro, retornamos uma resposta de erro
        console.error( error);
        statuscode = 404;
        res.status(404).json({ error: 'Erro ao criar transação, no catch.' });
    } finally{
        console.log('-------------------------------info da transação--------------------------------------- \n ', req.body," statuscode:",statuscode," \n -----------------------------Dados do cliente:",parseFloat(req.params.id),"------------------------------------ \n Saldo: ",saldo,"      Limite:",limite,"   \n  --------------------------------------------------------------------------------------");
    }
})



try {
    app.listen(8080,() =>{
    console.log('Server is running on port 8080')
    }) 
}
catch (error) {
    console.error(error);
    process.exit(1);
  }

