import { classifyPamphletPaper, isPamphletPageCount, type PamphletFamily } from '../paper';
import type { ImpositionPlan, PlacedPage } from './layout';
import type { PageSize } from './types';
import { applyPlateLayout } from './plateLayout';
import { PLATE_WIDTH_MM, PLATE_HEIGHT_MM } from './plateSettings';

export interface PamphletJob { pageCount: number; pageSize: PageSize; quantity: number }
export interface PamphletQuantityPolicy { halfLargeFrom: number; fullLargeFrom: number }
/** Provisional cutoffs: resolves the brief's overlapping half-size ranges and missing 2100 case. */
export const PAMPHLET_QUANTITY_POLICY: PamphletQuantityPolicy = { halfLargeFrom:4001, fullLargeFrom:2101 };
export interface PamphletPlan extends ImpositionPlan {
  pamphlet: {
    family: PamphletFamily; paperName: string; referencePage: number;
    quantity: number; doubleSided: boolean; positions: number; frontPositions: number; backPositions: number;
    finishedPerSheet: number; netSheets: number; impressions: number;
    orientation: string;
  };
}

/** The eight shop layouts. Rows are listed top to bottom, with a centre gutter only. */
export const PAMPHLET_TEMPLATES = [
  {referencePage:1,family:'half',large:false,doubleSided:false,columns:2,rows:2,turn:0,backTurn:0},
  {referencePage:2,family:'half',large:false,doubleSided:true,columns:2,rows:2,turn:0,backTurn:180},
  {referencePage:3,family:'half',large:true,doubleSided:false,columns:2,rows:4,turn:270,backTurn:270},
  {referencePage:4,family:'half',large:true,doubleSided:true,columns:2,rows:4,turn:270,backTurn:270},
  {referencePage:5,family:'full',large:false,doubleSided:false,columns:1,rows:2,turn:270,backTurn:270},
  {referencePage:6,family:'full',large:false,doubleSided:true,columns:1,rows:2,turn:270,backTurn:270},
  {referencePage:7,family:'full',large:true,doubleSided:false,columns:2,rows:2,turn:0,backTurn:0},
  {referencePage:8,family:'full',large:true,doubleSided:true,columns:2,rows:2,turn:0,backTurn:180},
] as const;

export function planPamphlet(job: PamphletJob, policy: PamphletQuantityPolicy = PAMPHLET_QUANTITY_POLICY): PamphletPlan {
  if (!isPamphletPageCount(job.pageCount)) throw new Error('Pamphlets require exactly one or two source pages.');
  if (!Number.isSafeInteger(job.quantity) || job.quantity<1 || job.quantity>1_000_000_000) throw new Error('Enter a positive whole-number quantity, up to one billion.');
  const paper=classifyPamphletPaper(job.pageSize.width,job.pageSize.height);
  if (!paper) throw new Error('Pamphlets support A5, half-letter, A4 and Letter pages (±5 mm), in either orientation.');
  const large=job.quantity >= (paper.family==='half' ? policy.halfLargeFrom : policy.fullLargeFrom);
  const doubleSided=job.pageCount===2;
  const template=PAMPHLET_TEMPLATES.find(t=>t.family===paper.family&&t.large===large&&t.doubleSided===doubleSided)!;
  const turned=template.turn===270;
  const w=turned?paper.heightMm:paper.widthMm;
  const h=turned?paper.widthMm:paper.heightMm;
  const gutter=7.62;
  const blockW=template.columns*w, blockH=template.rows*h+gutter;
  const x=(PLATE_WIDTH_MM-blockW)/2, y=(PLATE_HEIGHT_MM-blockH)/2;
  const slots: PlacedPage[]=[];
  for(let row=0;row<template.rows;row++) for(let col=0;col<template.columns;col++) {
    const back=doubleSided&&row<template.rows/2;
    // Back normalization turns the opposite way so work-and-tumble heads still match.
    const rotation=((back?template.backTurn-paper.toPortrait:template.turn+paper.toPortrait)+360)%360 as 0|90|180|270;
    slots.push({page:back?2:1,x:x+col*w,y:y+row*h+(row>=template.rows/2?gutter:0),width:w,height:h,rotated:rotation===180,rotation});
  }
  const positions=slots.length;
  const netSheets=Math.ceil(job.quantity/positions);
  const orientation=template.turn===270 ? 'All heads face left in the normalized page orientation' : doubleSided ? 'Front and back heads face each other' : 'All fronts face up';
  const plan: PamphletPlan={
    sheetWidthMm:PLATE_WIDTH_MM,sheetHeightMm:PLATE_HEIGHT_MM,onPlate:true,error:null,warnings:[],
    sheets:[{label:doubleSided?'Pamphlet · Front / Back':'Pamphlet · Single side',side:'front',slots}],
    guides:{x:[x+blockW/2],y:[y+blockH/2]},
    summary:doubleSided ? `${positions/2} front + ${positions/2} back positions on one plate · work and tumble · ${job.quantity.toLocaleString('en-US')} finished copies.` : `${positions}-up single-sided pamphlet · ${job.quantity.toLocaleString('en-US')} finished copies.`,
    pamphlet:{family:paper.family,paperName:paper.name,referencePage:template.referencePage,quantity:job.quantity,doubleSided,positions,frontPositions:doubleSided?positions/2:positions,backPositions:doubleSided?positions/2:0,finishedPerSheet:positions,netSheets,impressions:netSheets*(doubleSided?2:1),orientation},
  };
  applyPlateLayout(plan,false,null);
  plan.sheets[0].plate!.label=doubleSided?'Front / Back':'Single Side';
  return plan;
}
