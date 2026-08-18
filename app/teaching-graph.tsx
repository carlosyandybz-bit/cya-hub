"use client";

import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ArrowLeft, ChevronDown, ChevronUp, Crosshair, GitBranch, Route, RotateCcw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SecureDriveAsset } from "./drive-media";
import { getRuntimeSupabaseClient } from "./supabase-runtime";
import type { TeachingCardMedia } from "./teaching-content-card";

type TaxonomyLink = { style_term_id?: number; role_term_id?: number; level_term_id?: number };
type GraphContent = {
  id: number;
  title: string;
  content_type: string;
  summary: string | null;
  description: string | null;
  correction_guidance: string | null;
  is_mandatory: boolean;
  completion_status: string;
  publication_status: string;
  requires_partner?: boolean;
  teaching_content_styles: TaxonomyLink[];
  teaching_content_roles: TaxonomyLink[];
  teaching_content_levels: TaxonomyLink[];
  teaching_content_media: TeachingCardMedia[];
};

type GraphRelation = { id: number; source_content_id: number; target_content_id: number; relation_type: string; position: number | null };
type Term = { id: number; term_key?: string; label: string; taxonomy: string; sort_order: number };
type TreeRow = { id:number; style_term_id:number; role_term_id:number };
type TreeSetting = { tree_id:number; content_id:number; is_mandatory:boolean };
type PortSide = "top" | "bottom" | "left" | "right";
type TeachingNodeData = {
  kind:"content";
  content: GraphContent;
  level: string;
  relationCount: number;
  mandatory: boolean;
  selected: boolean;
  inRoute: boolean;
  derived: boolean;
  ports: Record<PortSide,string[]>;
};
type LevelBandData = {
  kind:"level-band";
  label:string;
  fill:string;
  border:string;
  text:string;
};
type FlowNodeData = TeachingNodeData | LevelBandData;
type GraphEdgeData = { orientation:"vertical"|"lateral"; lane:number; bridgeXs:number[]; label:string; mandatory:boolean };

const NODE_WIDTH=252;
const NODE_HEIGHT=142;
const X_GAP=390;
const Y_GAP=238;
const LEVEL_BAND_PAD_X=78;
const LEVEL_BAND_PAD_Y=62;
const LEVEL_BAND_GAP=56;
const levelTones=[
  {fill:"rgba(70,116,255,.075)",border:"rgba(104,143,255,.24)",text:"#aebfff"},
  {fill:"rgba(31,174,146,.07)",border:"rgba(67,203,177,.22)",text:"#9de8d7"},
  {fill:"rgba(194,113,43,.072)",border:"rgba(231,151,78,.23)",text:"#f1bd89"},
  {fill:"rgba(152,78,203,.068)",border:"rgba(184,119,228,.22)",text:"#d9afea"},
  {fill:"rgba(201,75,116,.064)",border:"rgba(229,115,151,.21)",text:"#efb1c5"},
  {fill:"rgba(94,151,64,.068)",border:"rgba(132,190,100,.21)",text:"#c2dfa9"},
];
const kindLabels: Record<string,string>={ correction:"Corrección", explanation:"Explicación", exercise:"Ejercicio", sequence:"Secuencia" };
const relationLabels: Record<string,string>={ prerequisite:"Necesita antes", counterpart:"Homóloga", exercise_explanation:"Trabaja explicación", exercise_correction:"Trabaja corrección", sequence_item:"Paso", related:"Relacionada" };
const routeRelationTypes=new Set(["prerequisite","counterpart","exercise_explanation","exercise_correction","sequence_item"]);
const lateralRelationTypes=new Set(["counterpart","exercise_explanation","exercise_correction","sequence_item","related"]);

function portStyle(index:number,total:number,side:PortSide){
  const pct=`${((index+1)/(total+1))*100}%`;
  return side==="top"||side==="bottom"?{left:pct}:{top:pct};
}

function TeachingNode({data}:NodeProps<Node<FlowNodeData>>){
  if(data.kind!=="content")return null;
  return <article className={`flow-node kind-${data.content.content_type} ${data.mandatory?"mandatory":""} ${data.selected?"selected":""} ${data.inRoute?"in-route":""} ${data.derived?"derived":""}`}>
    {data.ports.top.map((id,index)=><Handle key={id} id={id} type="target" position={Position.Top} style={portStyle(index,data.ports.top.length,"top")}/>) }
    {data.ports.bottom.map((id,index)=><Handle key={id} id={id} type="source" position={Position.Bottom} style={portStyle(index,data.ports.bottom.length,"bottom")}/>) }
    {data.ports.left.map((id,index)=><Handle key={id} id={id} type={id.includes(":in:")?"target":"source"} position={Position.Left} style={portStyle(index,data.ports.left.length,"left")}/>) }
    {data.ports.right.map((id,index)=><Handle key={id} id={id} type={id.includes(":in:")?"target":"source"} position={Position.Right} style={portStyle(index,data.ports.right.length,"right")}/>) }
    <span>{kindLabels[data.content.content_type]??data.content.content_type}</span>
    <strong>{data.content.title}</strong>
    {data.content.summary?<em className="flow-node-summary">{data.content.summary}</em>:null}
    <small>{data.level} · {data.relationCount} conexiones{data.content.requires_partner?" · necesita pareja":""}</small>
    <div className="flow-node-flags"><i>{data.content.completion_status==="complete"?"Completa":"Incompleta"}</i>{data.mandatory?<b>Obligatorio en este árbol</b>:null}{data.derived?<b className="derived-badge">Aprendido por derivación</b>:null}</div>
  </article>;
}

function LevelBandNode({data}:NodeProps<Node<FlowNodeData>>){
  if(data.kind!=="level-band")return null;
  return <section className="graph-level-band" style={{backgroundColor:data.fill,borderColor:data.border,color:data.text}} aria-hidden="true"><strong>{data.label}</strong><span>Nivel</span></section>;
}

function horizontalWithBridges(x1:number,x2:number,y:number,bridgeXs:number[]){
  const direction=x2>=x1?1:-1;
  const sorted=[...bridgeXs].filter((x)=>direction>0?x>x1+8&&x<x2-8:x<x1-8&&x>x2+8).sort((a,b)=>direction*(a-b));
  let path=`M ${x1} ${y}`;
  for(const x of sorted){
    const r=8;
    path+=` L ${x-direction*r} ${y} A ${r} ${r} 0 0 ${direction>0?1:0} ${x+direction*r} ${y}`;
  }
  return `${path} L ${x2} ${y}`;
}

function KnowledgeEdge(props:EdgeProps<Edge<GraphEdgeData>>){
  const {id,sourceX,sourceY,targetX,targetY,markerEnd,style,data}=props;
  const edgeData=data??{orientation:"vertical",lane:0,bridgeXs:[],label:"",mandatory:false};
  let path="";
  let labelX=(sourceX+targetX)/2,labelY=(sourceY+targetY)/2;
  if(edgeData.orientation==="vertical"){
    const laneX=(sourceX+targetX)/2+edgeData.lane*16;
    path=`M ${sourceX} ${sourceY} L ${sourceX} ${sourceY+24} L ${laneX} ${sourceY+24} L ${laneX} ${targetY-24} L ${targetX} ${targetY-24} L ${targetX} ${targetY}`;
    labelX=laneX+7;
  }else{
    const laneY=sourceY+edgeData.lane*18;
    const elbowX=targetX>sourceX?targetX-28:targetX+28;
    path=`M ${sourceX} ${sourceY} L ${sourceX+(targetX>sourceX?24:-24)} ${sourceY} ${horizontalWithBridges(sourceX+(targetX>sourceX?24:-24),elbowX,laneY,edgeData.bridgeXs).replace(/^M[^L]+/,"")} L ${elbowX} ${targetY} L ${targetX} ${targetY}`;
    labelY=laneY-7;
  }
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style}/>
    {edgeData.label?<EdgeLabelRenderer><span className={`graph-edge-label ${edgeData.mandatory?"mandatory":""}`} style={{transform:`translate(-50%,-50%) translate(${labelX}px,${labelY}px)`}}>{edgeData.label}</span></EdgeLabelRenderer>:null}
  </>;
}

function GraphCanvas({contents,relations,terms}:{contents:GraphContent[];relations:GraphRelation[];terms:Term[]}){
  const flow=useReactFlow();
  const [styleId,setStyleId]=useState(""),[roleId,setRoleId]=useState(""),[levelId,setLevelId]=useState(""),[kind,setKind]=useState(""),[query,setQuery]=useState("");
  const [selectedId,setSelectedId]=useState<number|null>(null),[history,setHistory]=useState<number[]>([]),[routeMode,setRouteMode]=useState(false),[layoutRevision,setLayoutRevision]=useState(0),[showDerived,setShowDerived]=useState(false);
  const [trees,setTrees]=useState<TreeRow[]>([]),[treeSettings,setTreeSettings]=useState<TreeSetting[]>([]),[treeBusy,setTreeBusy]=useState(false),[treeError,setTreeError]=useState("");
  const styles=terms.filter((term)=>term.taxonomy==="dance_style").sort((a,b)=>a.sort_order-b.sort_order),roles=terms.filter((term)=>term.taxonomy==="dance_role").sort((a,b)=>a.sort_order-b.sort_order),levels=terms.filter((term)=>term.taxonomy==="dance_level").sort((a,b)=>a.sort_order-b.sort_order);
  const termMap=new Map(terms.map((term)=>[term.id,term]));
  const contentMap=new Map(contents.map((content)=>[content.id,content]));
  const treePresets=styles.flatMap((style)=>roles.map((role)=>({key:`${style.id}-${role.id}`,style,role})));

  const loadTreeState=useCallback(async()=>{
    const client=getRuntimeSupabaseClient();
    if(!client)return;
    const [treeResult,settingResult]=await Promise.all([
      client.from("teaching_trees").select("id,style_term_id,role_term_id").eq("active",true),
      client.from("teaching_tree_content_settings").select("tree_id,content_id,is_mandatory"),
    ]);
    if(treeResult.error||settingResult.error){setTreeError(treeResult.error?.message||settingResult.error?.message||"No se ha podido leer el camino obligatorio.");return;}
    setTrees((treeResult.data??[]) as TreeRow[]);setTreeSettings((settingResult.data??[]) as TreeSetting[]);setTreeError("");
  },[]);
  useEffect(()=>{void loadTreeState();},[loadTreeState,contents]);

  const selectedTree=useMemo(()=>styleId&&roleId?trees.find((tree)=>tree.style_term_id===Number(styleId)&&tree.role_term_id===Number(roleId))??null:null,[trees,styleId,roleId]);
  const mandatorySet=useMemo(()=>selectedTree?new Set(treeSettings.filter((setting)=>setting.tree_id===selectedTree.id&&setting.is_mandatory).map((setting)=>setting.content_id)):new Set<number>(),[selectedTree,treeSettings]);

  const baseFiltered=useMemo(()=>contents.filter((content)=>content.publication_status!=="archived")
    .filter((content)=>!styleId||content.teaching_content_styles.some((item)=>item.style_term_id===Number(styleId)))
    .filter((content)=>!roleId||content.teaching_content_roles.some((item)=>item.role_term_id===Number(roleId)))
    .filter((content)=>!levelId||content.teaching_content_levels.some((item)=>item.level_term_id===Number(levelId)))
    .filter((content)=>!kind||content.content_type===kind),[contents,styleId,roleId,levelId,kind]);

  const normalized=query.trim().toLocaleLowerCase("es");
  const matches=useMemo(()=>!normalized?baseFiltered:baseFiltered.filter((content)=>[content.title,content.summary,content.description,content.correction_guidance].filter(Boolean).some((value)=>String(value).toLocaleLowerCase("es").includes(normalized))).sort((a,b)=>Number(b.title.toLocaleLowerCase("es")===normalized)-Number(a.title.toLocaleLowerCase("es")===normalized)),[baseFiltered,normalized]);
  const searchFocus=normalized&&matches.length?matches[0]:null;

  const prereqParents=useMemo(()=>{
    const map=new Map<number,number[]>();
    relations.filter((r)=>r.relation_type==="prerequisite").forEach((r)=>map.set(r.source_content_id,[...(map.get(r.source_content_id)??[]),r.target_content_id]));
    return map;
  },[relations]);
  const dependents=useMemo(()=>{
    const map=new Map<number,number[]>();
    relations.filter((r)=>r.relation_type==="prerequisite").forEach((r)=>map.set(r.target_content_id,[...(map.get(r.target_content_id)??[]),r.source_content_id]));
    return map;
  },[relations]);

  function ancestorSet(id:number){
    const visited=new Set<number>(),queue=[...(prereqParents.get(id)??[])];
    while(queue.length){const current=queue.shift()!;if(visited.has(current))continue;visited.add(current);queue.push(...(prereqParents.get(current)??[]));}
    return visited;
  }

  const searchAncestors=useMemo(()=>searchFocus?ancestorSet(searchFocus.id):new Set<number>(),[searchFocus,prereqParents]);
  const immediateIds=useMemo(()=>new Set(searchFocus?(prereqParents.get(searchFocus.id)??[]):[]),[searchFocus,prereqParents]);
  const derivedIds=useMemo(()=>new Set([...searchAncestors].filter((id)=>!immediateIds.has(id))),[searchAncestors,immediateIds]);
  const contextualIds=useMemo(()=>{
    if(!searchFocus)return new Set(baseFiltered.map((c)=>c.id));
    const ids=new Set<number>([searchFocus.id,...immediateIds,...(showDerived?[...derivedIds]:[])]);
    (dependents.get(searchFocus.id)??[]).forEach((id)=>ids.add(id));
    relations.filter((r)=>lateralRelationTypes.has(r.relation_type)&&(r.source_content_id===searchFocus.id||r.target_content_id===searchFocus.id)).forEach((r)=>ids.add(r.source_content_id===searchFocus.id?r.target_content_id:r.source_content_id));
    return ids;
  },[searchFocus,baseFiltered,immediateIds,derivedIds,showDerived,dependents,relations]);

  const routeIds=useMemo(()=>{
    if(!routeMode||!selectedId)return null;
    const allowed=new Set(baseFiltered.map((c)=>c.id)),visited=new Set<number>([selectedId]),queue=[selectedId];
    while(queue.length){const current=queue.shift()!;relations.forEach((relation)=>{if(!routeRelationTypes.has(relation.relation_type))return;const neighbor=relation.source_content_id===current?relation.target_content_id:relation.target_content_id===current?relation.source_content_id:null;if(neighbor&&allowed.has(neighbor)&&!visited.has(neighbor)){visited.add(neighbor);queue.push(neighbor);}});}
    return visited;
  },[routeMode,selectedId,baseFiltered,relations]);

  const displayed=baseFiltered.filter((content)=>contextualIds.has(content.id)&&(!routeIds||routeIds.has(content.id)));
  const visibleIds=new Set(displayed.map((content)=>content.id));
  const visibleRelations=relations.filter((relation)=>visibleIds.has(relation.source_content_id)&&visibleIds.has(relation.target_content_id)&&(!routeIds||routeRelationTypes.has(relation.relation_type)));

  const mainIds=new Set(displayed.filter((c)=>c.content_type==="explanation"||c.content_type==="sequence").map((c)=>c.id));
  const depthMemo=new Map<number,number>();
  function depth(id:number,stack=new Set<number>()):number{
    if(depthMemo.has(id))return depthMemo.get(id)!;
    if(stack.has(id))return 0;
    const nextStack=new Set(stack).add(id);
    const parents=(prereqParents.get(id)??[]).filter((parent)=>visibleIds.has(parent));
    const value=parents.length?Math.max(...parents.map((parent)=>depth(parent,nextStack)+1)):0;
    depthMemo.set(id,value);return value;
  }

  const componentMemo=new Map<number,number>();
  function componentRoot(id:number){
    if(componentMemo.has(id))return componentMemo.get(id)!;
    const visited=new Set<number>(),queue=[id];let root=id;
    while(queue.length){const current=queue.shift()!;if(visited.has(current))continue;visited.add(current);root=Math.min(root,current);(prereqParents.get(current)??[]).filter((x)=>mainIds.has(x)).forEach((x)=>queue.push(x));(dependents.get(current)??[]).filter((x)=>mainIds.has(x)).forEach((x)=>queue.push(x));}
    visited.forEach((x)=>componentMemo.set(x,root));return root;
  }
  const roots=[...new Set([...mainIds].map(componentRoot))].sort((a,b)=>a-b);
  const rootLane=new Map(roots.map((root,index)=>[root,index]));
  const positions=new Map<number,{x:number;y:number}>();

  const mainByDepth=new Map<string,number[]>();
  displayed.filter((c)=>mainIds.has(c.id)).forEach((c)=>{const key=`${componentRoot(c.id)}:${depth(c.id)}`;mainByDepth.set(key,[...(mainByDepth.get(key)??[]),c.id]);});
  mainByDepth.forEach((ids,key)=>{
    const [rootRaw,depthRaw]=key.split(":").map(Number),lane=rootLane.get(rootRaw)??0;
    ids.sort((a,b)=>Number(mandatorySet.has(b))-Number(mandatorySet.has(a))||String(contentMap.get(a)?.title).localeCompare(String(contentMap.get(b)?.title),"es"));
    ids.forEach((id,index)=>positions.set(id,{x:lane*X_GAP+(index-(ids.length-1)/2)*286,y:depthRaw*Y_GAP}));
  });

  const auxiliary=displayed.filter((c)=>!mainIds.has(c.id));
  const sideCounters=new Map<number,{left:number;right:number}>();
  auxiliary.forEach((content,index)=>{
    const related=visibleRelations.find((r)=>(r.source_content_id===content.id&&mainIds.has(r.target_content_id))||(r.target_content_id===content.id&&mainIds.has(r.source_content_id)));
    const anchorId=related?(mainIds.has(related.source_content_id)?related.source_content_id:related.target_content_id):[...mainIds][index%Math.max(1,mainIds.size)];
    const anchor=positions.get(anchorId)??{x:0,y:index*Y_GAP};
    const counter=sideCounters.get(anchorId)??{left:0,right:0};
    const side=content.content_type==="correction"?"left":content.content_type==="exercise"?"right":(counter.left<=counter.right?"left":"right");
    const row=counter[side]++;sideCounters.set(anchorId,counter);
    positions.set(content.id,{x:anchor.x+(side==="left"?-320:320),y:anchor.y+row*168+22});
  });

  const levelFor=(content:GraphContent)=>content.teaching_content_levels.map((item)=>item.level_term_id).find((value):value is number=>Boolean(value))??null;
  const levelOrder=new Map(levels.map((term,index)=>[term.id,index]));
  const levelGroups=new Map<number|null,GraphContent[]>();
  displayed.forEach((content)=>{const id=levelFor(content);levelGroups.set(id,[...(levelGroups.get(id)??[]),content]);});
  const orderedLevelIds=[...levelGroups.keys()].sort((a,b)=>a===null?1:b===null?-1:(levelOrder.get(a)??999)-(levelOrder.get(b)??999));
  let levelCursor=0;
  orderedLevelIds.forEach((currentLevel)=>{
    const group=levelGroups.get(currentLevel)??[];
    const groupPositions=group.map((content)=>positions.get(content.id)).filter((value):value is {x:number;y:number}=>Boolean(value));
    if(!groupPositions.length)return;
    const minY=Math.min(...groupPositions.map((value)=>value.y)),maxY=Math.max(...groupPositions.map((value)=>value.y));
    const delta=levelCursor-minY;
    group.forEach((content)=>{const current=positions.get(content.id);if(current)positions.set(content.id,{x:current.x,y:current.y+delta});});
    levelCursor+=(maxY-minY)+NODE_HEIGHT+LEVEL_BAND_PAD_Y*2+LEVEL_BAND_GAP;
  });

  const bandNodes:Node<FlowNodeData>[]=[];
  orderedLevelIds.forEach((currentLevel,index)=>{
    const group=levelGroups.get(currentLevel)??[];
    const groupPositions=group.map((content)=>positions.get(content.id)).filter((value):value is {x:number;y:number}=>Boolean(value));
    if(!groupPositions.length)return;
    const minX=Math.min(...groupPositions.map((value)=>value.x))-LEVEL_BAND_PAD_X;
    const maxX=Math.max(...groupPositions.map((value)=>value.x))+NODE_WIDTH+LEVEL_BAND_PAD_X;
    const minY=Math.min(...groupPositions.map((value)=>value.y))-LEVEL_BAND_PAD_Y;
    const maxY=Math.max(...groupPositions.map((value)=>value.y))+NODE_HEIGHT+LEVEL_BAND_PAD_Y;
    const term=currentLevel===null?null:termMap.get(currentLevel),tone=levelTones[index%levelTones.length];
    bandNodes.push({id:`level-band-${currentLevel??"none"}`,type:"levelBand",position:{x:minX,y:minY},data:{kind:"level-band",label:term?.label??"Sin nivel",...tone},draggable:false,selectable:false,connectable:false,focusable:false,zIndex:-10,style:{width:maxX-minX,height:maxY-minY,pointerEvents:"none"}});
  });

  const portMap=new Map<number,Record<PortSide,string[]>>();
  displayed.forEach((c)=>portMap.set(c.id,{top:[],bottom:[],left:[],right:[]}));
  type EdgeDraft={relation:GraphRelation;source:number;target:number;orientation:"vertical"|"lateral";sourceSide:PortSide;targetSide:PortSide;lane:number;mandatory:boolean};
  const drafts:EdgeDraft[]=visibleRelations.map((relation,index)=>{
    if(relation.relation_type==="prerequisite"){
      const source=relation.target_content_id,target=relation.source_content_id;
      return {relation,source,target,orientation:"vertical",sourceSide:"bottom",targetSide:"top",lane:(index%5)-2,mandatory:mandatorySet.has(source)&&mandatorySet.has(target)};
    }
    const source=relation.source_content_id,target=relation.target_content_id;
    const sp=positions.get(source)??{x:0,y:0},tp=positions.get(target)??{x:0,y:0};
    const sourceSide=tp.x>=sp.x?"right":"left",targetSide=tp.x>=sp.x?"left":"right";
    return {relation,source,target,orientation:"lateral",sourceSide,targetSide,lane:(index%5)-2,mandatory:false};
  });
  drafts.forEach((draft)=>{
    const outId=`edge:${draft.relation.id}:out:${draft.sourceSide}`,inId=`edge:${draft.relation.id}:in:${draft.targetSide}`;
    portMap.get(draft.source)?.[draft.sourceSide].push(outId);portMap.get(draft.target)?.[draft.targetSide].push(inId);
  });

  const verticalLanes=drafts.filter((d)=>d.orientation==="vertical").map((draft)=>{const sp=positions.get(draft.source)!,tp=positions.get(draft.target)!;return {x:(sp.x+tp.x)/2+NODE_WIDTH/2+draft.lane*16,y1:sp.y+NODE_HEIGHT,y2:tp.y};});
  const edges:Edge<GraphEdgeData>[]=drafts.map((draft)=>{
    const sp=positions.get(draft.source)!,tp=positions.get(draft.target)!;
    const horizontalY=sp.y+NODE_HEIGHT/2+draft.lane*18;
    const minX=Math.min(sp.x,tp.x),maxX=Math.max(sp.x,tp.x);
    const bridgeXs=draft.orientation==="lateral"?verticalLanes.filter((v)=>v.x>minX+20&&v.x<maxX+NODE_WIDTH-20&&horizontalY>Math.min(v.y1,v.y2)&&horizontalY<Math.max(v.y1,v.y2)).map((v)=>v.x):[];
    return {id:String(draft.relation.id),source:String(draft.source),target:String(draft.target),sourceHandle:`edge:${draft.relation.id}:out:${draft.sourceSide}`,targetHandle:`edge:${draft.relation.id}:in:${draft.targetSide}`,type:"knowledge",markerEnd:{type:MarkerType.ArrowClosed,width:15,height:15},className:`flow-edge relation-${draft.relation.relation_type} ${draft.mandatory?"mandatory-edge":""}`,data:{orientation:draft.orientation,lane:draft.lane,bridgeXs,label:relationLabels[draft.relation.relation_type]??draft.relation.relation_type,mandatory:draft.mandatory}};
  });

  const contentNodes:Node<FlowNodeData>[]=displayed.map((content)=>({id:String(content.id),type:"teaching",position:positions.get(content.id)??{x:0,y:0},zIndex:1,data:{kind:"content",content,mandatory:mandatorySet.has(content.id),level:(content.teaching_content_levels.map((item)=>item.level_term_id).filter((v):v is number=>Boolean(v)).map((id)=>termMap.get(id)?.label).filter(Boolean).join(" · ")||"Sin nivel"),relationCount:relations.filter((r)=>r.source_content_id===content.id||r.target_content_id===content.id).length,selected:selectedId===content.id,inRoute:Boolean(routeIds?.has(content.id)),derived:derivedIds.has(content.id),ports:portMap.get(content.id)??{top:[],bottom:[],left:[],right:[]}}}));
  const nodes:Node<FlowNodeData>[]=[...bandNodes,...contentNodes];

  const selected=contents.find((content)=>content.id===selectedId)??null;
  const selectedMandatory=selected?mandatorySet.has(selected.id):false;
  const selectedRelations=selected?relations.filter((relation)=>relation.source_content_id===selected.id||relation.target_content_id===selected.id):[];
  function selectNode(id:number){if(selectedId&&selectedId!==id)setHistory((current)=>[...current.slice(-9),selectedId]);setSelectedId(id);window.setTimeout(()=>flow.fitView({nodes:[{id:String(id)}],duration:420,padding:.8,maxZoom:1.35}),0);}
  function goBack(){const previous=history.at(-1);if(!previous)return;setHistory((current)=>current.slice(0,-1));setSelectedId(previous);window.setTimeout(()=>flow.fitView({nodes:[{id:String(previous)}],duration:420,padding:.8,maxZoom:1.35}),0);}
  function applyTree(style:Term,role:Term){setStyleId(String(style.id));setRoleId(String(role.id));setSelectedId(null);setHistory([]);setRouteMode(false);setShowDerived(false);}
  function reorganizeMap(){setLayoutRevision((value)=>value+1);window.setTimeout(()=>flow.fitView({duration:420,padding:.16,maxZoom:1}),0);}
  function resetMap(){setStyleId("");setRoleId("");setLevelId("");setKind("");setQuery("");setSelectedId(null);setHistory([]);setRouteMode(false);setShowDerived(false);window.setTimeout(()=>flow.fitView({duration:350,padding:.18,maxZoom:1}),0);}
  async function toggleMandatory(){
    if(!selected||!styleId||!roleId||!["explanation","sequence"].includes(selected.content_type))return;
    const client=getRuntimeSupabaseClient();if(!client)return;
    setTreeBusy(true);setTreeError("");
    const result=await client.rpc("set_teaching_tree_content_mandatory",{p_style_term_id:Number(styleId),p_role_term_id:Number(roleId),p_content_id:selected.id,p_is_mandatory:!selectedMandatory});
    if(result.error)setTreeError(result.error.message);else await loadTreeState();
    setTreeBusy(false);
  }
  useEffect(()=>{const timer=window.setTimeout(()=>flow.fitView({duration:360,padding:.16,maxZoom:1}),40);return()=>clearTimeout(timer);},[styleId,roleId,levelId,kind,query,routeMode,showDerived,layoutRevision,flow]);

  const exactTreeSelected=Boolean(styleId&&roleId);
  return <section className="teaching-graph-shell">
    <div className="graph-tree-presets" aria-label="Árboles por estilo y rol">{treePresets.map(({key,style,role})=><button key={key} className={styleId===String(style.id)&&roleId===String(role.id)?"active":""} onClick={()=>applyTree(style,role)}><GitBranch/><span>{style.label}</span><strong>{role.label}</strong></button>)}</div>
    <div className="graph-filterbar">
      <label className="graph-search"><Search/><input value={query} onChange={(event)=>{setQuery(event.target.value);setShowDerived(false);}} placeholder="Buscar nodo…"/></label>
      <select value={styleId} onChange={(event)=>{setStyleId(event.target.value);setRouteMode(false);}} aria-label="Filtrar estilo"><option value="">Todos los estilos</option>{styles.map((term)=><option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={roleId} onChange={(event)=>{setRoleId(event.target.value);setRouteMode(false);}} aria-label="Filtrar rol"><option value="">Todos los roles</option>{roles.map((term)=><option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={levelId} onChange={(event)=>setLevelId(event.target.value)} aria-label="Filtrar nivel"><option value="">Todos los niveles</option>{levels.map((term)=><option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={kind} onChange={(event)=>setKind(event.target.value)} aria-label="Filtrar tipo"><option value="">Todos los tipos</option><option value="explanation">Explicaciones</option><option value="sequence">Secuencias</option><option value="exercise">Ejercicios</option><option value="correction">Correcciones</option></select>
    </div>
    {!exactTreeSelected?<div className="graph-tree-scope-hint"><GitBranch/><span>Selecciona un árbol de estilo + rol para ver y editar su camino obligatorio.</span></div>:null}
    {treeError?<p className="error graph-tree-error">{treeError}</p>:null}
    {searchFocus&&derivedIds.size?<div className="derived-chain-bar"><div><span>Camino hasta {searchFocus.title}</span><strong>{[...immediateIds].map((id)=>contentMap.get(id)?.title).filter(Boolean).join(" · ")||"Sin prerrequisito inmediato"}</strong></div><button onClick={()=>setShowDerived((value)=>!value)}>{showDerived?<><ChevronUp/>Contraer anteriores</>:<><ChevronDown/>+{derivedIds.size} anteriores por derivación</>}</button></div>:null}
    <div className="teaching-graph" role="application" aria-label="Mapa táctil de enseñanza ordenado por niveles">
      {contentNodes.length?<ReactFlow key={`teaching-layout-${layoutRevision}`} nodes={nodes} edges={edges} nodeTypes={{teaching:TeachingNode,levelBand:LevelBandNode}} edgeTypes={{knowledge:KnowledgeEdge}} onNodeClick={(_,node)=>{if((node.data as FlowNodeData).kind==="content")selectNode(Number(node.id));}} fitView fitViewOptions={{padding:.16,maxZoom:1}} minZoom={.18} maxZoom={2} panOnDrag zoomOnPinch zoomOnScroll preventScrolling nodesDraggable nodesConnectable={false} elementsSelectable proOptions={{hideAttribution:true}}>
        <Background gap={24} size={1} color="#ddd7ed"/><Controls showInteractive={false} position="bottom-left"/><MiniMap pannable zoomable position="bottom-right" nodeColor={(node)=>{const data=node.data as FlowNodeData;return data.kind==="level-band"?"transparent":({explanation:"#6d4aff",correction:"#d35f78",exercise:"#19865a",sequence:"#3f78c6"}[data.content.content_type]??"#8d85a1");}}/>
        <Panel position="top-right" className="graph-actions"><button className="graph-reorganize" onClick={reorganizeMap}><GitBranch/>Reorganizar</button><button onClick={resetMap}><RotateCcw/>Resetear</button>{selected?<><button className={routeMode?"active":""} onClick={()=>setRouteMode((value)=>!value)}><Route/>{routeMode?"Mapa completo":"Ruta"}</button><button onClick={()=>flow.fitView({nodes:[{id:String(selected.id)}],duration:350,padding:.8,maxZoom:1.35})}><Crosshair/>Centrar</button></>:null}{history.length?<button onClick={goBack}><ArrowLeft/>Anterior</button>:null}</Panel>
      </ReactFlow>:<div className="graph-empty"><GitBranch/><strong>{routeMode?"No hay una ruta conectada con estos filtros":"No hay nodos con estos filtros"}</strong><span>Amplía la búsqueda o crea contenido relacionado.</span></div>}
    </div>
    {selected?<aside className="graph-detail"><header><div><span>{kindLabels[selected.content_type]??selected.content_type}</span><h3>{selected.title}</h3></div><button className="icon-btn" onClick={()=>{setSelectedId(null);setRouteMode(false);}} aria-label="Cerrar detalle"><X/></button></header>{selectedMandatory?<div className="graph-mandatory-badge">Camino obligatorio de este árbol</div>:null}{["explanation","sequence"].includes(selected.content_type)?<div className="graph-tree-mandatory-control"><div><strong>Camino obligatorio</strong><small>{exactTreeSelected?selectedMandatory?"Este conocimiento forma parte del mínimo curricular de este árbol.":"Este contenido es opcional en este árbol.":"Selecciona primero un árbol de estilo + rol."}</small></div><button className={selectedMandatory?"active":""} disabled={!exactTreeSelected||treeBusy} onClick={()=>void toggleMandatory()}>{treeBusy?"Guardando…":selectedMandatory?"Quitar de obligatorio":"Marcar obligatorio"}</button></div>:null}{selected.requires_partner?<div className="graph-partner-badge">Necesita pareja</div>:null}{derivedIds.has(selected.id)?<div className="graph-derived-badge">Aprendido por derivación · no modifica el progreso real</div>:null}{selected.summary?<p className="graph-summary">{selected.summary}</p>:null}{selected.description?<p>{selected.description}</p>:null}{selected.correction_guidance?<p><strong>Cómo trabajarlo:</strong> {selected.correction_guidance}</p>:null}<div className="graph-related"><strong>Relaciones</strong>{selectedRelations.length?selectedRelations.map((relation)=>{const otherId=relation.source_content_id===selected.id?relation.target_content_id:relation.source_content_id,other=contents.find((content)=>content.id===otherId);return other?<button key={relation.id} onClick={()=>selectNode(other.id)}><span>{relationLabels[relation.relation_type]??relation.relation_type}</span><strong>{other.title}</strong><Crosshair/></button>:null;}):<small>Sin relaciones registradas.</small>}</div>{selected.teaching_content_media.length?<div className="graph-media"><strong>Multimedia</strong><div className="graph-media-grid">{selected.teaching_content_media.filter((media)=>media.display_in_resources!==false).map((media)=><article key={media.id??media.external_file_id}><div className="graph-media-frame"><SecureDriveAsset fileId={media.external_file_id} mediaType={media.media_type} title={media.title} thumbnailFileId={media.thumbnail_external_file_id} controls={media.media_type==="video"}/></div><span>{media.title||(media.media_type==="video"?"Vídeo":"Imagen")}</span></article>)}</div></div>:null}</aside>:null}
  </section>;
}

export function TeachingGraph(props:{contents:GraphContent[];relations:GraphRelation[];terms:Term[]}){return <ReactFlowProvider><GraphCanvas {...props}/></ReactFlowProvider>;}
