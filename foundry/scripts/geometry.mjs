// Calibração afim 2D. Não certifica distância, colisão, visão ou combate.
const finite = n => typeof n === "number" && Number.isFinite(n);
function point(p) {
  if (!p || !finite(p.x) || !finite(p.y)) throw new TypeError("Coordenada deve conter x/y finitos.");
  return p;
}
function matrix(m) {
  if (!Array.isArray(m) || m.length !== 6 || !m.every(finite)) throw new TypeError("Transformação deve ter seis coeficientes finitos.");
  return m;
}
export function transformPoint(p, coefficients) {
  point(p);
  const [a,b,c,d,e,f] = matrix(coefficients);
  const result = {x:a*p.x+b*p.y+c, y:d*p.x+e*p.y+f};
  return point(result);
}
export function invertTransform(coefficients) {
  const [a,b,c,d,e,f] = matrix(coefficients);
  const det = a*e-b*d;
  const scale = Math.max(Math.abs(a),Math.abs(b),Math.abs(d),Math.abs(e));
  if (!finite(det) || scale === 0 || Math.abs(det) <= 1e-12*scale*scale) throw new RangeError("Calibração singular ou instável.");
  return [e/det,-b/det,(b*f-e*c)/det,-d/det,a/det,(d*c-a*f)/det];
}
function solve3(a,b) {
  const rows = a.map((row,i)=>[...row,b[i]]);
  for(let c=0;c<3;c++) {
    let pivot=c;
    for(let r=c+1;r<3;r++) if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c])) pivot=r;
    if(Math.abs(rows[pivot][c])<1e-10) throw new RangeError("Pontos de calibração colineares ou insuficientes.");
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    const divisor=rows[c][c];
    for(let j=c;j<4;j++) rows[c][j]/=divisor;
    for(let r=0;r<3;r++) if(r!==c) {
      const multiplier=rows[r][c];
      for(let j=c;j<4;j++) rows[r][j]-=multiplier*rows[c][j];
    }
  }
  return rows.map(row=>row[3]);
}
export function fitAffine(controlPoints) {
  if(!Array.isArray(controlPoints)||controlPoints.length<3) throw new RangeError("Informe no mínimo três pares de pontos.");
  for(const pair of controlPoints) { point(pair.source); point(pair.target); }
  const center={x:0,y:0};
  for(const p of controlPoints) {center.x+=p.source.x/controlPoints.length;center.y+=p.source.y/controlPoints.length;}
  const scale=Math.max(...controlPoints.map(p=>Math.max(Math.abs(p.source.x-center.x),Math.abs(p.source.y-center.y))));
  if(!finite(scale)||scale===0) throw new RangeError("Pontos de origem coincidentes.");
  const normal=Array.from({length:3},()=>[0,0,0]), bx=[0,0,0],by=[0,0,0];
  for(const p of controlPoints) {
    const row=[(p.source.x-center.x)/scale,(p.source.y-center.y)/scale,1];
    for(let i=0;i<3;i++) { bx[i]+=row[i]*p.target.x;by[i]+=row[i]*p.target.y;for(let j=0;j<3;j++)normal[i][j]+=row[i]*row[j]; }
  }
  const x=solve3(normal,bx), y=solve3(normal,by);
  const coefficients=[x[0]/scale,x[1]/scale,x[2]-x[0]*center.x/scale-x[1]*center.y/scale,y[0]/scale,y[1]/scale,y[2]-y[0]*center.x/scale-y[1]*center.y/scale];
  invertTransform(coefficients);
  const errors=controlPoints.map(p=>{const t=transformPoint(p.source,coefficients);return Math.hypot(t.x-p.target.x,t.y-p.target.y);});
  return {kind:"affine2d",coefficients,rmsError:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),maxError:Math.max(...errors),combatValidated:false};
}
export function convertPosition(position,{origin="top-left",width,height,coefficients}={}) {
  point(position);
  if(coefficients) return transformPoint(position,coefficients);
  if(!finite(width)||width<=0||!finite(height)||height<=0) throw new RangeError("Dimensões positivas obrigatórias.");
  switch(origin) {
    case "top-left": return {...position};
    case "bottom-left": return {x:position.x,y:height-position.y};
    case "normalized-top-left": return {x:position.x*width,y:position.y*height};
    case "normalized-bottom-left": return {x:position.x*width,y:(1-position.y)*height};
    default: throw new RangeError("Origem de coordenadas desconhecida.");
  }
}
