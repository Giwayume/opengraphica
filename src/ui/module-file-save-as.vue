<template>
    <el-form
        ref="form"
        v-loading="loading"
        action="javascript:void(0)"
        label-position="left"
        :model="formData.workingFile"
        :rules="formValidationRules"
        novalidate="novalidate"
        hide-required-asterisk
        @submit="onSave">
        <el-form-item-group>
            <el-form-item label="File Name" prop="fileName">
                <el-input v-model="formData.workingFile.fileName" clearable></el-input>
            </el-form-item>
        </el-form-item-group>
        <div class="has-text-right">
            <el-button @click="onCancel">Cancel</el-button>
            <el-button type="primary" native-type="submit">Save</el-button>
        </div>
    </el-form>
</template>

<script lang="ts">
import { defineComponent, ref, reactive, watch, nextTick } from 'vue';
import ElButton from 'element-plus/lib/el-button';
import ElForm from 'element-plus/lib/el-form';
import ElFormItem from 'element-plus/lib/el-form-item';
import ElFormItemGroup from '@/ui/el-form-item-group.vue';
import ElInput from 'element-plus/lib/el-input';
import ElLoading from 'element-plus/lib/el-loading';
import workingFileStore from '@/store/working-file';
import { notifyInjector, unexpectedErrorMessage, validationSubmissionErrorMessage } from '@/lib/notify';
import { Rules, RuleItem } from 'async-validator';
import { saveImageAs } from '@/modules/file/save';

export default defineComponent({
    name: 'ModuleFileSaveAs',
    directives: {
        loading: ElLoading.directive
    },
    components: {
        ElButton,
        ElForm,
        ElFormItem,
        ElFormItemGroup,
        ElInput
    },
    emits: [
        'update:title',
        'close'
    ],
    setup(props, { emit }) {
        emit('update:title', 'Save Image As');

        const $notify = notifyInjector('$notify');
        const form = ref<typeof ElForm>();
        const loading = ref<boolean>(false);
       
        const formData = reactive({
            workingFile: {
                fileName: workingFileStore.get('fileName')
            }
        });
        const formValidationRules: Rules = {};

        function onCancel() {
            emit('close');
        }

        async function onSave() {
            if (!form.value) {
                return;
            }
            try {
                await form.value.validate();
                loading.value = true;
                try {
                    workingFileStore.set('fileName', formData.workingFile.fileName);
                    await saveImageAs({
                        fileName: formData.workingFile.fileName,
                    });
                } catch (error) {
                    $notify({
                        type: 'error',
                        dangerouslyUseHTMLString: true,
                        message: unexpectedErrorMessage
                    });
                }
                emit('close');
                loading.value = false;
            } catch (error) {
                $notify({
                    type: 'error',
                    dangerouslyUseHTMLString: true,
                    message: validationSubmissionErrorMessage
                });
            }
        }
        
        return {
            form,
            loading,
            formData,
            formValidationRules,
            onCancel,
            onSave
        };
    }
});
</script>