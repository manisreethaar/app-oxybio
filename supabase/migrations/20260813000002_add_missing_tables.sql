-- Create edit_requests table
CREATE TABLE IF NOT EXISTS public.edit_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    record_id UUID NOT NULL,
    record_type TEXT NOT NULL,
    requested_by UUID REFERENCES public.employees(id),
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create scale_up_records table
CREATE TABLE IF NOT EXISTS public.scale_up_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bench_scale_batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
    production_scale_batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.employees(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create system_health_log table
CREATE TABLE IF NOT EXISTS public.system_health_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    active_employees INTEGER DEFAULT 0,
    attendance_today INTEGER DEFAULT 0,
    active_batches INTEGER DEFAULT 0,
    open_deviations INTEGER DEFAULT 0,
    total_documents INTEGER DEFAULT 0,
    status TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
