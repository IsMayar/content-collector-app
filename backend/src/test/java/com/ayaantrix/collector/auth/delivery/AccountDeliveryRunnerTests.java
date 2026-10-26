package com.ayaantrix.collector.auth.delivery;

import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
class AccountDeliveryRunnerTests {
    private final VerificationDeliveryWorker worker=mock(VerificationDeliveryWorker.class);
    private final VerificationMailSender sender=mock(VerificationMailSender.class);
    private final TokenDeliveryCipher cipher=mock(TokenDeliveryCipher.class);
    @BeforeEach void adapter(){when(sender.available()).thenReturn(true);}
    private ApplicationContextRunner context(){return new ApplicationContextRunner()
        .withUserConfiguration(AccountDeliveryRunner.class)
        .withBean(VerificationDeliveryWorker.class,()->worker)
        .withBean(VerificationMailSender.class,()->sender).withBean(TokenDeliveryCipher.class,()->cipher);}
    @Test void pollingIsAbsentByDefault(){context().run(c->{assertThat(c).doesNotHaveBean(AccountDeliveryRunner.class);verifyNoInteractions(worker);});}
    @Test void explicitEnableStartsAndContextCloseStopsWorker(){
        var instance=new java.util.concurrent.atomic.AtomicReference<AccountDeliveryRunner>();
        context().withPropertyValues("collector.delivery.worker-enabled=true").run(c->{
            instance.set(c.getBean(AccountDeliveryRunner.class));assertThat(instance.get().isRunning()).isTrue();
        });assertThat(instance.get().isRunning()).isFalse();
    }
    @Test void enabledRunnerRejectsDisabledSender(){when(sender.available()).thenReturn(false);
        context().withPropertyValues("collector.delivery.worker-enabled=true").run(c->assertThat(c).hasFailed());verifyNoInteractions(worker);}
    @Test void enabledRunnerRejectsMissingKey(){doThrow(new IllegalStateException("Delivery configuration unavailable.")).when(cipher).requireConfigured();
        context().withPropertyValues("collector.delivery.worker-enabled=true").run(c->assertThat(c).hasFailed());verifyNoInteractions(worker);}
    @ParameterizedTest @CsvSource({"0,100,1","51,100,1","1,99,1","1,60001,1","1,100,0","1,100,31"})
    void validatesPollingBounds(int batch,long delay,int shutdown){
        assertThatThrownBy(()->new AccountDeliveryRunner(worker,sender,cipher,batch,delay,shutdown)).isInstanceOf(IllegalStateException.class);
    }
    @Test void eachPollHasBoundedBatchAndStopDrainsInflight() throws Exception {
        var entered=new CountDownLatch(1);var finish=new CountDownLatch(1);var calls=new AtomicInteger();
        when(worker.dispatchOne()).thenAnswer(invocation->{
            int call=calls.incrementAndGet();if(call==2){entered.countDown();assertThat(finish.await(3,TimeUnit.SECONDS)).isTrue();}return true;
        });
        var runner=new AccountDeliveryRunner(worker,sender,cipher,2,1000,2);
        runner.start();runner.start();
        try{
            assertThat(entered.await(3,TimeUnit.SECONDS)).isTrue();
            try(var pool=Executors.newSingleThreadExecutor()){
                var stopping=pool.submit((Runnable)runner::stop);finish.countDown();stopping.get(3,TimeUnit.SECONDS);
            }
            assertThat(calls).hasValue(2);assertThat(runner.isRunning()).isFalse();runner.stop();
        }finally{finish.countDown();runner.stop();}
    }
    @Test void failedPollDoesNotKillFuturePollingOrLogAdapterDetails(org.springframework.boot.test.system.CapturedOutput logs) throws Exception {
        var second=new CountDownLatch(1);var calls=new AtomicInteger();
        when(worker.dispatchOne()).thenAnswer(invocation->{if(calls.incrementAndGet()==1)throw new IllegalStateException("synthetic-secret");second.countDown();return false;});
        var runner=new AccountDeliveryRunner(worker,sender,cipher,1,100,1);runner.start();
        try{assertThat(second.await(3,TimeUnit.SECONDS)).isTrue();}finally{runner.stop();}
        assertThat(logs.getAll()).doesNotContain("synthetic-secret");
    }
}
