import test from 'node:test';
import assert from 'node:assert/strict';
import {transformPoint,invertTransform,fitAffine,convertPosition} from '../../foundry/scripts/geometry.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('afim e inversa preservam coordenadas',()=>{
  const m=[2,-1,500,1,3,-20], p={x:123,y:-42};
  const result=transformPoint(transformPoint(p,m),invertTransform(m));near(result.x,p.x);near(result.y,p.y);
});
test('calibração recupera matriz conhecida e não valida combate',()=>{
  const m=[2,-1,500,1,3,-20];
  const pairs=[{x:0,y:0},{x:100,y:0},{x:0,y:100},{x:50,y:40}].map(source=>({source,target:transformPoint(source,m)}));
  const result=fitAffine(pairs);result.coefficients.forEach((v,i)=>near(v,m[i]));near(result.rmsError,0);assert.equal(result.combatValidated,false);
});
test('calibração normaliza coordenadas muito grandes',()=>{
  const pairs=[{x:1e9,y:1e9},{x:1e9+100,y:1e9},{x:1e9,y:1e9+100}].map(source=>({source,target:{x:(source.x-1e9)*2,y:(source.y-1e9)*3}}));
  const result=fitAffine(pairs);near(transformPoint(pairs[1].source,result.coefficients).x,200);
});
test('rejeita pontos degenerados e transformações singulares',()=>{
  assert.throws(()=>fitAffine([0,1,2].map(x=>({source:{x,y:x},target:{x,y:x}}))));
  assert.throws(()=>invertTransform([1,2,0,2,4,0]));
  assert.throws(()=>transformPoint({x:NaN,y:2},[1,0,0,0,1,0]));
});
test('origens de imagem explícitas',()=>{
  assert.deepEqual(convertPosition({x:0.25,y:0.4},{origin:'normalized-bottom-left',width:800,height:1000}),{x:200,y:600});
  assert.deepEqual(convertPosition({x:20,y:40},{origin:'bottom-left',width:800,height:1000}),{x:20,y:960});
  assert.throws(()=>convertPosition({x:1,y:2},{origin:'iso-magic',width:5,height:5}));
});
