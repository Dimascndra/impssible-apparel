import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { Job, Invoice, RawMaterial, OrderType } from '../../types';
import { AdminLayout, AdminTab } from './AdminLayout';
import { DashboardView } from './DashboardView';
import { InstructionsView } from './InstructionsView';
import { TrackingView } from './TrackingView';
import { OrderTypesView } from './OrderTypesView';
import { MarketingView } from './MarketingView';
import { WebsiteView } from './WebsiteView';
import { CashflowView } from './CashflowView';
import { BillingView } from './BillingView';

export const AdminDashboard: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([]);
  const [cashflow, setCashflow] = useState<any>({ summary: {}, per_spk: [], transactions: [] });
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Modals
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);

  const loadAllData = async () => {
    try {
      const [jobsRes, invRes, rmRes, otRes, cfRes] = await Promise.allSettled([
        apiClient<{ jobs: Job[] }>('/api/admin/jobs'),
        apiClient<{ invoices: Invoice[] }>('/api/admin/invoices'),
        apiClient<{ raw_materials: RawMaterial[] }>('/api/admin/raw-materials'),
        apiClient<{ order_types: OrderType[] }>('/api/admin/order-types'),
        apiClient<any>('/api/admin/cashflow'),
      ]);

      if (jobsRes.status === 'fulfilled' && jobsRes.value.jobs) {
        setJobs(jobsRes.value.jobs);
        if (selectedJob) {
          const fresh = jobsRes.value.jobs.find((j) => j.id === selectedJob.id);
          if (fresh) setSelectedJob(fresh);
        }
      }

      if (invRes.status === 'fulfilled' && invRes.value.invoices) {
        setInvoices(invRes.value.invoices);
      }

      if (rmRes.status === 'fulfilled' && rmRes.value.raw_materials) {
        setRawMaterials(rmRes.value.raw_materials);
      }

      if (otRes.status === 'fulfilled' && otRes.value.order_types) {
        setOrderTypes(otRes.value.order_types);
      }

      if (cfRes.status === 'fulfilled') {
        setCashflow(cfRes.value);
      }
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
    }
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AdminLayout
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      onRefreshAll={loadAllData}
    >
      {currentTab === 'dashboard' && (
        <DashboardView
          jobs={jobs}
          invoices={invoices}
          onNavigate={setCurrentTab}
          onOpenNewJob={() => setIsCreateJobOpen(true)}
          onOpenNewInvoice={() => setIsCreateInvoiceOpen(true)}
          onSelectJob={setSelectedJob}
        />
      )}

      {currentTab === 'instructions' && (
        <InstructionsView
          jobs={jobs}
          orderTypes={orderTypes}
          selectedJob={selectedJob}
          onSelectJob={setSelectedJob}
          onRefreshJobs={loadAllData}
          isCreateModalOpen={isCreateJobOpen}
          setIsCreateModalOpen={setIsCreateJobOpen}
        />
      )}

      {currentTab === 'tracking' && (
        <TrackingView jobs={jobs} onRefreshJobs={loadAllData} />
      )}

      {currentTab === 'orderTypes' && (
        <OrderTypesView
          rawMaterials={rawMaterials}
          orderTypes={orderTypes}
          onRefreshAll={loadAllData}
        />
      )}

      {currentTab === 'marketing' && <MarketingView />}

      {currentTab === 'website' && <WebsiteView />}

      {currentTab === 'cashflow' && (
        <CashflowView cashflow={cashflow} onRefreshAll={loadAllData} />
      )}

      {currentTab === 'billing' && (
        <BillingView
          invoices={invoices}
          jobs={jobs}
          onRefreshAll={loadAllData}
          isCreateModalOpen={isCreateInvoiceOpen}
          setIsCreateModalOpen={setIsCreateInvoiceOpen}
        />
      )}
    </AdminLayout>
  );
};
