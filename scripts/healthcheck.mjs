import http from 'node:http';
const host=new URL(process.env.PUBLIC_ORIGIN).host;
const req=http.get({host:'127.0.0.1',port:4318,path:'/healthz',headers:{Host:host},timeout:5000},res=>{res.resume();process.exit(res.statusCode===200?0:1);});req.on('error',()=>process.exit(1));req.on('timeout',()=>process.exit(1));
