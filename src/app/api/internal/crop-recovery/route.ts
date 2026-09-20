import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processObjectiveCropRecoveryBatch } from "@/lib/objective-crop-recovery";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

const TOKEN="sos-crop-recovery-20260920-91ab4d2e";

export async function GET(req:NextRequest){
  if(req.nextUrl.searchParams.get("token")!==TOKEN){
    return NextResponse.json({success:false,message:"forbidden"},{status:403});
  }
  const limit=Math.max(1,Math.min(12,Number(req.nextUrl.searchParams.get("limit")??6)||6));
  try{
    const result=await processObjectiveCropRecoveryBatch(createClient(),limit);
    return NextResponse.json({success:true,...result});
  }catch(e){
    return NextResponse.json({success:false,message:e instanceof Error?e.message:String(e)},{status:500});
  }
}

export async function POST(req:NextRequest){return GET(req);}
