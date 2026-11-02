export function addComparisonPlayer(current:readonly number[],id:number,max=8):number[] {
 if(!Number.isInteger(id)||id<=0||current.includes(id)||current.length>=max)return [...current];
 return [...current,id];
}
export function removeComparisonPlayer(current:readonly number[],id:number):number[] {
 return current.filter(value=>value!==id);
}
export function moveComparisonPlayer(current:readonly number[],id:number,offset:-1|1):number[] {
 const index=current.indexOf(id),next=index+offset;
 if(index<0||next<0||next>=current.length)return [...current];
 const copy=[...current];[copy[index],copy[next]]=[copy[next],copy[index]];
 return copy;
}
export function initialComparisonIds(hash:string):number[] {
 const raw=hash.split('?')[1]??'';
 const ids=new URLSearchParams(raw).get('ids')??'';
 return ids.split(',').map(x=>Number(x)).reduce<number[]>((acc,id)=>addComparisonPlayer(acc,id),[]);
}
