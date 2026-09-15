import {NextResponse} from "next/server";
import {getAdminUser} from "@/lib/supabase/auth";
import {createClient} from "@/lib/supabase/server";
export async function POST(request:Request){
 const admin=await getAdminUser();if(!admin)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
 try{
  const form=await request.formData(),id=String(form.get("id")??""),asset=String(form.get("asset")??"question"),file=form.get("file");
  if(!/^[0-9a-f-]{36}$/i.test(id)||!["question","solution"].includes(asset)||!(file instanceof File)||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)return NextResponse.json({message:"8MB 이하 PNG/JPG/WEBP 이미지를 선택해 주세요."},{status:400});
  const db=createClient();const found=await db.from("problem_bank_questions").select("id,question_image_path,problem_dna,updated_at").eq("id",id).single();if(found.error)throw found.error;
  const row=found.data,review=row.problem_dna?.errorReview;
  if(!review?.open)return NextResponse.json({message:"오류 보관 중인 문항만 교체할 수 있습니다."},{status:409});
  if(String(form.get("expectedUpdatedAt"))!==row.updated_at)return NextResponse.json({message:"문항이 변경되었습니다. 다시 열어 주세요."},{status:409});
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=`error-corrections/${id}/${crypto.randomUUID()}.${ext}`;
  const upload=await db.storage.from("question-images").upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;
  const now=new Date().toISOString();
  const meta={...row.problem_dna,errorReview:{...review,original:review.original??{questionImagePath:row.question_image_path},imageHistory:[...(review.imageHistory??[]),{asset,path,previousPath:asset==='question'?row.question_image_path:row.problem_dna?.correctedSolutionImagePath??null,at:now,by:admin.id}],editedAt:now,editedBy:admin.id}};
  if(asset==='solution')meta.correctedSolutionImagePath=path;
  const update:any={problem_dna:meta,status:"HOLD",updated_at:now};if(asset==='question')update.question_image_path=path;
  const saved=await db.from("problem_bank_questions").update(update).eq("id",id).eq("updated_at",row.updated_at).select("id").maybeSingle();
  if(saved.error||!saved.data){await db.storage.from("question-images").remove([path]);throw saved.error??new Error("다른 곳에서 수정됐습니다. 다시 열어 주세요.");}
  return NextResponse.json({success:true});
 }catch(e){return NextResponse.json({message:(e as any)?.message??"이미지 교체 실패"},{status:500});}
}
