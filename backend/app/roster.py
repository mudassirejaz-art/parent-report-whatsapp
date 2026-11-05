"""Bounded CSV parsing and guarded atomic class-roster imports."""
import csv
import hashlib
from io import StringIO
from uuid import UUID
from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from psycopg.types.json import Jsonb

HEADERS = {"name", "admission_number", "roll_number"}

class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    csv: str = Field(min_length=1,max_length=100_000)

class ImportRequest(PreviewRequest):
    request_id: UUID

def parse_roster(content: str):
    if len(content.encode("utf-8"))>100_000 or "\x00" in content:
        raise HTTPException(422,"Choose a UTF-8 CSV file smaller than 100 KB without null characters.")
    reader=csv.reader(StringIO(content.lstrip("\ufeff"),newline=""),strict=True)
    try:
        header=[h.strip().lower() for h in next(reader,[])]
        if len(header)!=3 or set(header)!=HEADERS:
            raise HTTPException(422,"CSV headers must be name, admission_number and roll_number, with no extra columns.")
        rows=[]
        for values in reader:
            if not values or all(not v.strip() for v in values): continue
            if len(values)!=3:
                raise HTTPException(422,f"CSV line {reader.line_num} must have exactly 3 columns.")
            rows.append(dict(zip(header,(v.strip() for v in values)))|{"row":reader.line_num})
            if len(rows)>200: raise HTTPException(422,"Import up to 200 students at a time. Split the file into smaller files.")
        if not rows: raise HTTPException(422,"Add at least one student below the CSV headers.")
        return rows
    except csv.Error:
        raise HTTPException(422,"CSV format is invalid. Check quotes and commas, or use the template.")

def register_roster(app,database):
    def run(conn,class_id,content,preview,request_id=None):
        rows=parse_roster(content)
        result=conn.execute("select app_private.import_roster(%s,%s,%s,%s,%s) as data",
            (class_id,Jsonb(rows),preview,request_id,hashlib.sha256(content.encode()).hexdigest())).fetchone()["data"]
        if not preview and not result["imported"]:
            raise HTTPException(409,"Nothing was imported. The roster changed or the file has errors. Preview the file again.")
        return result

    @app.post("/api/v1/classes/{class_id}/students/import-preview")
    def preview(class_id:UUID,body:PreviewRequest,conn=Depends(database)):
        return run(conn,class_id,body.csv,True)

    @app.post("/api/v1/classes/{class_id}/students/import")
    def commit(class_id:UUID,body:ImportRequest,conn=Depends(database)):
        return run(conn,class_id,body.csv,False,body.request_id)
